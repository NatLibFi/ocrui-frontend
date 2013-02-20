define(['underscore','jquery','events','toolbar','codemirror','alto','mybackbone','cmmode'],
    function (_,$,events,toolbar,CodeMirror,alto,mybackbone) {
    "use strict";

    var View = mybackbone.View.extend({

        initialize: function () {
            var that = this;
            this.cmConfig = {
                value: "",
                lineWrapping: true,
                mode: 'ocrui',
                changedSequence: [],
                changedSinceSaveSequence: [],
                languageSequence: [],
                highlight: {},
            };
            this.cMirror = new CodeMirror(this.$el.get(0), this.cmConfig);

            // suppress default codemirror bindings
            CodeMirror.commands.goPageUp = function () { };
            CodeMirror.commands.goPageDown = function () { };

            toolbar.registerButton({
                id:'highlight-editor-word',
                toggle:true,
                active:true,
                icon:'icon-star',
                title:'Highlight word in editor',
                modes:['page'],
                toggleCB:function(newState) {
                    that.cMirror.setOption('showHighlight',newState);
                    that.cMirror.replaceSelection(that.cMirror.getSelection());
                }});
            toolbar.registerButton({
                id:'show-saved-changes',
                toggle:true,
                icon:'icon-check',
                title:'Show unsaved changes',
                modes:['page'],
                toggleCB:function(newState) {
                    that.cMirror.setOption('showUnsavedChanges',newState);
                    that.cMirror.replaceSelection(that.cMirror.getSelection());
                }});
            toolbar.registerButton({
                id:'show-original-changes',
                toggle:true,
                active:true,
                icon:'icon-edit',
                title:'Show changes made to original',
                modes:['page'],
                toggleCB:function(newState) {
                    that.cMirror.setOption('showOriginalChanges',newState);
                    that.cMirror.replaceSelection(that.cMirror.getSelection());
                }});
            toolbar.registerButton({
                id:'show-language',
                toggle:true,
                active:true,
                icon:'icon-globe',
                title:'Show language of words',
                modes:['page'],
                toggleCB:function(newState) {
                    that.cMirror.setOption('showLanguage',newState);
                    that.cMirror.replaceSelection(that.cMirror.getSelection());
                }});

            this.cMirror.on('cursorActivity',function (instance) {
                events.delayOrIgnore('setupHighlightChange',undefined,100);
            });
            this.cMirror.on('change',function (instance) {
                if (that.suppressChanged) return ;
                that.changed(instance);
            });

        },
        el: '#editor',
        myEvents: {
            'virtualKeyboard':'virtualKeyboard',
            'cursorToCoordinate': 'moveCursorToWord',
            'refocus':'refocus',
            'changePage':'changePage',
            'requestLanguageChange':'requestLanguageChange',
            'setupHighlightChange':'setupHighlightChange',
            'pageDirtyStateChanged':'pageDirtyStateChanged'
        },
        virtualKeyboard: function(data) {
            this.cMirror.replaceSelection(data);
            this.cMirror.focus();
            var cursor = this.cMirror.getCursor();
            this.cMirror.setCursor(cursor);
        },
        requestLanguageChange: function(selected) {
            var wordIndexes = this.getCurrentWordIndexes();
            for (var wordIndexIndex in wordIndexes) {
                var i = wordIndexes[wordIndexIndex];
                this.alto.setNthWordLanguage(i,selected);
            }
            this.cMirror.replaceSelection(this.cMirror.getSelection());
            this.cMirror.focus();
        },
        refocus: function(ev) {
            this.cMirror.focus();
        },
        moveCursorToWord: function(coords) {
            var content = this.cMirror.getValue();
            var line = 0;
            var ch = 0;
            var inMiddleOfWord = false;
            if (!this.alto) { return; }
            var word = this.alto.getWordAt(coords.x,coords.y);
            if (word === undefined) {return;}
            var wordIndex = word.index;
            for (var i in content) {
                var c = content[i];
                if (c == '\n') {
                    line ++;
                    ch = 0;
                }
                if (c.match(/\S/)) {
                    if (inMiddleOfWord) wordIndex --;
                    if (wordIndex === 0) {break;}
                    inMiddleOfWord = false;
                } else {
                    inMiddleOfWord = true;
                }
                ch ++;
            }
            this.cMirror.setCursor(line,ch);
            this.cMirror.focus();
        },
        configureCMMode: function () {
            this.cmConfigchangedSinceSaveSequence =
                this.alto.getChangedSinceSaveSequence();
            this.cmConfig.changedSequence = this.alto.getChangedSequence();
            this.cmConfig.languageSequence = this.alto.getLanguageSequence();
        },
        changed: function (instance) {
            var content = instance.getValue();
            this.alto.updateStringContent(content);
            this.configureCMMode();
            this.setupHighlightChange();
        },
        getCurrentWordIndexes: function () {
            var wordIndexes = {};
            var wordIndex = 0;
            var content = this.cMirror.getValue();
            var start = this.cMirror.getCursor('start');
            var end = this.cMirror.getCursor('end');
            var s_line = start.line;
            var s_ch = start.ch;
            var e_line = end.line;
            var e_ch = end.ch;
            var inMiddleOfWord = false;
            var slice = "";
            for (var i in content) {
                var c = content[i];
                if (c.match(/\S/)) {
                    if (inMiddleOfWord) wordIndex ++;
                    inMiddleOfWord = false;
                } else {
                    inMiddleOfWord = true;
                }
                if (s_line <= 0) {

                    if (s_ch <= 0) {

                        wordIndexes[wordIndex] = true;
                        slice += c;
                    }
                    s_ch --;
                    if (e_line <=0) {
                        if (e_ch <= 0) {
                            var isEmpty = true;
                            for (var j in wordIndexes) {
                                isEmpty = false;
                                break;
                            }
                            if (isEmpty) {
                                slice += c;
                                wordIndexes[wordIndex] = true;
                            }
                            break;
                        }
                        e_ch --;
                    }
                }
                if (c == '\n') {
                    s_line --;
                    e_line --;
                }
            }
            this.words = wordIndexes;
            var wordIndexArray = _.map(wordIndexes,function (v,k) {
                return parseInt(k,10);
            });
            return wordIndexArray;
        },
        setupHighlightChange: function () {

            var wordIndexes = this.getCurrentWordIndexes();
            var that = this;
            var words = _.map(wordIndexes,function (v,k) {

                return that.alto.getNthWord(v);

            });

            that.cMirror.setOption('highlight',this.words);
            this.suppressChanged = true;
            this.cMirror.view.frontier = 0;
            this.cMirror.replaceSelection(this.cMirror.getSelection());
            this.suppressChanged = false;

            events.trigger('changeCoordinates',words);

        },
        changePage: function(attributes) {
            var that = this;
            this.attributes = attributes;
            alto.get(attributes).then(
                function(myAlto) {
                    /* if (this.attributes != attributes) return;*/
                    that.setAlto(myAlto);
                },
                function(msg) {
                    events.trigger('editorRenderError',{
                        error: 'editorRenderError',
                        message: msg
                    });
                }
            );
        },
        pageDirtyStateChanged: function() {
            if(this.alto.isDirty()) {
                this.$el.addClass('dirty');
            } else {
                this.$el.removeClass('dirty');
            }
        },
        setAlto: function(alto) {
            this.alto = alto;
            var s = alto.getString();
            this.cMirror.setValue(s);
            this.cMirror.clearHistory();
            var word = this.alto.getNthWord(0);
            this.cMirror.focus();
            events.trigger('editorRendered',this.attributes);
        },
        render: function() {
            return;     // Nothing to do, CodeMirror renders itself
        }
    });

    return {
        view: new View()
    };

});
