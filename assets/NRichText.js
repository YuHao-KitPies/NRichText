// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce(func, wait, immediate) {
    let timeout;
    return function () {
        let context = this;
        let later = function () {
            timeout = null;
            if (!immediate) func.apply(context, arguments);
        };
        let callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, arguments);
    };
}

cc.Class({
    extends: cc.Component,

    ctor: function () {

        if (CC_EDITOR) {
            this._updateRichTextStatus = debounce(this._updateRichText, 200);
        }
        else {
            this._updateRichTextStatus = this._updateRichText;
        }
    },

    properties: {
        string: {
            default: '',
            tooltip: CC_DEV && '在这里设置内容字符串',
            multiline: true,
            notify: function () {
                this._updateRichTextStatus();
            }
        },
        fontColor: {
            default: cc.Color.WHITE,
            tooltip: CC_DEV && '字体颜色',
            notify: function () {
                this._updateRichTextStatus();
            }
        },
        fontSize: {
            default: 32,
            tooltip: CC_DEV && '字体大小',
            notify: function () {
                this._updateRichTextStatus();
            }
        },
        font: {
            default: null,
            type: cc.TTFFont,
            tooltip: CC_DEV && '定制字体',
            animatable: false,
            notify: function () {
                this._updateRichTextStatus();
            }
        },
        fontFamily: {
            default: 'Arial',
            tooltip: CC_DEV && '系统字体',
            animatable: false,
            notify: function () {
                this._updateRichTextStatus();
            }
        },
        lineHeight: {
            default: 40,
            tooltip: CC_DEV && '行高',
            notify: function () {
                this._updateRichTextStatus();
            }
        },
        wordSpace: {
            default: 3,
            tooltip: CC_DEV && '字间距',
            notify: function () {
                this._updateRichTextStatus();
            }
        },
        maxWidth: {
            default: 320,
            tooltip: CC_DEV && '最大宽度',
            notify: function () {
                this._updateRichTextStatus();
            }
        },
        baseResDir: {
            default: '',
            tooltip: CC_DEV && '资源基本路径',
            notify: function(){
                this._updateRichTextStatus();
            }
        },
        _resDir: '',
        _snpool: null,
        _tnpool: null,
        _inpool: null,
        debug: {
            default: false,
            type: Boolean,
            notify: function(){
                this._updateRichTextStatus();
            },
            tooltip: CC_DEV && '调试模式'
        }
    },

    editor: {
        executeInEditMode: true,
        disallowMultiple: false,
        menu: 'i18n:MAIN_MENU.component.renderers/NRichText',
    },

    start(){
        this._updateRichText();
    },

    onEnable: function () {
        this.node.on(cc.Node.EventType.TOUCH_START, this._handleTouchStart, this);
        this.node.on(cc.Node.EventType.TOUCH_END, this._handleTouchEnd, this);
    },

    onDisable: function () {
        this.node.off(cc.Node.EventType.TOUCH_START, this._handleTouchStart, this);
        this.node.off(cc.Node.EventType.TOUCH_END, this._handleTouchEnd, this);
    },

    _handleTouchStart(event) {
        //do nothing
    },

    _handleTouchEnd(event) {
        var touchPoint = event.getLocation();
        var localPoint = this.node.convertToNodeSpaceAR(touchPoint);

        var inputs = this._getAllInputNodes();

        for (var i = 0; i < inputs.length; i++) {
            for (var j = 0, l, r; j < inputs[i].labels.length; j++) {
                l = inputs[i].labels[j];
                r = l.getBoundingBox().contains(localPoint);
                if (r) {
                    this._updateInputBoxsFocus(inputs[i]);
                    this._focusChangedListener && this._focusChangedListener(inputs[i].ipID);
                    return;
                }
            }
        }
        //点击输入框外失去焦点
        // this._updateInputBoxsFocus(null);
        // this._focusChangedListener && this._focusChangedListener(undefined);
    },

    //重置输入框焦点
    _resetInputBoxsFocus() {
        this._focusInputBox = null;
        this._renderFIBTime = 0;
    },

    //更新输入框焦点
    _updateInputBoxsFocus(inputBox) {
        if (this._focusInputBox) {
            this._focusInputBox.active = false;
        }
        this._focusInputBox = inputBox;
        this._renderFIBTime = 0;
    },

    //判断是否有输入框已经获取了焦点
    _isSomeOneInputBoxFocused() {
        return this._focusInputBox;
    },

    //跳转到达下一个输入框
    toNextFoucus() {
        var inputs = this._getAllInputNodes();
        inputs = inputs.filter(function (e) { return !e.inputContent });

        inputs = inputs.sort(function (a, b) { return a.rawData.cStartIndex - b.rawData.cStartIndex });

        if (inputs.length > 0) {
            this._updateInputBoxsFocus(inputs[0]);
            this._focusChangedListener && this._focusChangedListener(inputs[0].ipID);
        }
    },

    //获取当前所有的输入
    getAllCurrentInput() {
        var inputs = this._getAllInputNodes();
        return inputs.map(function (e) {
            return {
                id: e.ipID,
                inputContent: e.inputContent
            }
        });
    },

    //判断所有输入框都有值
    isAllInputBoxFilled() {
        var inputs = this._getAllInputNodes();
        return inputs.every(function (e) { return e.inputContent && e.inputContent.length > 0 });
    },

    //对当前的焦点输入框进行内容输入
    setCurrentFocusInputById(input, id) {
        if (this._focusInputBox && this._focusInputBox.ipID == id) {

            this._renderInputBoxInput(this._focusInputBox, input);
            return this._focusInputBox.inputContent;
        }
        return '';
    },

    _updateRichText(){
        this._handleInput(this.string);
    },

    //处理输入
    _handleInput(input) {
        this._currentInput = input;
        this._handlePools();
        //回收当前子对象
        this._recycleCurrentChildren();
        //清理空白字符
        var r = input.replace(/\s+/gi, ' ').replace(/\]\s\(/gi, '](');
        //进行语义校验
        var vr = this._verifyInput(r);
        if (vr) {
            var sr = this._splitInput(r);
            this._contentRaw = sr;
            //更新富文本显示框自身的状态
            this._handleSelfState();
            //生成格式缓存
            this._generateStyleCache();

            this._loadRes(function (resMap) {
                this._resMap = resMap;
                this._handleSurroundImg();

                this._showAllContent();

                //处理自动获取焦点
                this._handleAutoFocus();

                this._updateSelfBox();
                this._updateAnchorPoint();
                this._renderDebugLine();
            }.bind(this));
        }
        return r;
    },

    //处理对象池
    _handlePools() {
        if (!this._snpool) {
            this._snpool = new cc.NodePool();
        }
        if (!this._tnpool) {
            this._tnpool = new cc.NodePool();
        }
        if (!this._inpool) {
            this._inpool = new cc.NodePool();
        }
    },

    //处理自动获取焦点
    _handleAutoFocus() {
        if (this._autoFocus && !this._isSomeOneInputBoxFocused()) {
            this.toNextFoucus();
        }
    },

    //回收当前子对象
    _recycleCurrentChildren() {
        //清空输入焦点
        this._updateInputBoxsFocus(null);
        var e;
        while (this.node.childrenCount > 0) {
            e = this.node.children[0];
            if (e.rc instanceof cc.Label) {
                this._recycleALabelNode(e);
            } else if (e.rc instanceof cc.Sprite) {
                this._recycleASpriteNode(e);
            } else if (e.rc instanceof cc.Graphics) {
                this._recycleAInputNode(e);
            } else {
                e.removeFromParent(true);
                e.destroy();
            }
        }
    },

    //加载资源
    _loadRes(callback) {
        var resList = this._contentRaw.resList;

        if (resList instanceof Array && resList.length > 0) {
            var nResList = resList.map(function (e) {
                return this.baseResDir + this._resDir + e;
            }, this);
            cc.loader.loadResArray(nResList, cc.SpriteFrame, function (names, err, res) {
                if (err) {
                    cc.log(err);
                    callback && callback({});
                } else {
                    var resMap = {};
                    for (var i = 0; i < res.length; i++) {
                        resMap[names[i]] = res[i];
                    }
                    callback && callback(resMap);
                }
                this._resLoadedListener && this._resLoadedListener();
            }.bind(this, resList));
        } else {
            callback && callback({});
            this._resLoadedListener && this._resLoadedListener();
        }
    },

    //设置资源加载完毕监听
    setResLoadedListener(listener) {
        this._resLoadedListener = listener;
    },

    //清除加载监听器
    clearResLoadedListener() {
        this._resLoadedListener = null;
    },

    //设置输入框焦点变化监听
    setInputFocusChangedLister(listener) {
        this._focusChangedListener = listener;
    },

    //取消输入框焦点变化监听
    clearInputFocusChangedLister() {
        this._focusChangedListener = null;
    },

    //修正富文本显示框的状态
    _handleSelfState() {
        var settings = this._contentRaw.settings;
        this._resDir = settings.resDir || '';
        if (settings.lineHeight) {
            this._lineHeight = parseInt(settings.lineHeight) || this.lineHeight;
        } else {
            this._lineHeight = this.lineHeight;
        }
        if (settings.wordSpace) {
            this._wordSpace = parseInt(settings.wordSpace) || this.wordSpace;
        } else {
            this._wordSpace = this.wordSpace;
        }
        if (settings.color) {
            this._fontColor = new cc.Color();
            this._fontColor = this._fontColor.fromHEX(settings.color);
        } else {
            this._fontColor = this.fontColor;
        }
        if (settings.fontSize) {
            this._fontSize = parseInt(settings.fontSize) || this.fontSize;
        } else {
            this._fontSize = this.fontSize;
        }
        if (settings.width) {
            this.node.width = parseInt(settings.width) || this.maxWidth;
        } else {
            this.node.width = this.maxWidth;
        }
        if (settings.debug) {
            this._debug = settings.debug == 'true';
        } else {
            this._debug = this.debug;
        }
        if (settings.autoFocus) {
            this._autoFocus = settings.autoFocus == 'true';
        } else {
            this._autoFocus = true;
        }
    },

    //生成格式描述缓存
    _generateStyleCache() {
        var style = this._contentRaw.style;
        this._styleCache = {
            color: {
                default: this._fontColor,
                temp: [this._fontColor],
                values: []
            },
            size: {
                default: this._fontSize,
                temp: [this._fontSize],
                values: []
            },
            blob: {
                default: false,
                temp: [false],
                values: []
            },
            italic: {
                default: false,
                temp: [false],
                values: []
            }
        };
        var cmdList = [];
        for (var i = 0, ss, obj; i < style.length; i++) {
            ss = style[i];
            cmdList.push({
                index: ss.cStartIndex,
                type: ss.name,
                value: ss.value,
                cmd: 'push'
            });
            cmdList.push({
                index: ss.cEndIndex + 1,
                type: ss.name,
                value: ss.value,
                cmd: 'pop'
            });
        }
        cmdList = cmdList.sort(function (a, b) {
            return a.index - b.index;
        });
        for (var i = 0, cmd, lib, list, tvalue; i < cmdList.length; i++) {
            cmd = cmdList[i];
            lib = this._styleCache[cmd.type].temp;
            list = this._styleCache[cmd.type].values;
            if (cmd.cmd == 'pop') {
                lib.pop();
                list[cmd.index] = lib.slice(0);
            } else if (cmd.cmd == 'push') {
                if (cmd.type == 'color') {
                    tvalue = new cc.Color();
                    tvalue.fromHEX(cmd.value);
                } else if (cmd.type == 'size') {
                    tvalue = parseInt(cmd.value);
                }
                lib.push(tvalue);
                list[cmd.index] = lib.slice(0);
            }
        }
    },

    //获取文档流的格式化描述
    _getStyleAt(pos) {

        return {
            color: this._findStyleByTypeAt('color', pos),
            fontSize: this._findStyleByTypeAt('size', pos),
            blob: this._findStyleByTypeAt('blob', pos),
            italic: this._findStyleByTypeAt('italic', pos)
        }
    },

    //查找格式
    _findStyleByTypeAt(type, pos) {
        var c = this._styleCache[type], r = c.default;

        for (var i = pos; i >= 0; i--) {
            if (c.values[i] != undefined) {
                r = c.values[i][c.values[i].length - 1];
                break;
            }
        }
        return r;
    },

    //获取并显示环绕图片
    _handleSurroundImg() {
        var surround = this._contentRaw.surround;
        this._resetOccupySpace();
        if (surround instanceof Array) {
            for (var i = 0, sn, snc, sp, ratio, config; i < surround.length; i++) {
                config = surround[i];
                sn = this._getASpriteNode();
                snc = sn.rc;
                snc.type = cc.Sprite.Type.SLICED;
                snc.sizeMode = cc.Sprite.SizeMode.CUSTOM;
                sn.setAnchorPoint(0.5, 1);
                sn.name = config.content;
                this.node.addChild(sn);
                if (sp = this._resMap[config.content]) {
                    snc.spriteFrame = sp;
                    ratio = sp._originalSize.width / sp._originalSize.height;
                    var h = config.h && parseInt(config.h);
                    var w = config.w && parseInt(config.w);
                    if (h && !w) {
                        sn.setContentSize(h * ratio, h);
                    } else if (w && !h) {
                        sn.setContentSize(w, w / ratio);
                    } else if (w && h) {
                        sn.setContentSize(w, h);
                    } else {
                        sn.setContentSize(sp._originalSize);
                    }
                } else {
                    sn.setContentSize(2, 2);
                }
                var hSpace = 0;
                if (config.hSpace) {
                    hSpace = parseInt(config.hSpace);
                    hSpace = hSpace > 0 ? hSpace : 0;
                }
                sn.hSpace = hSpace;
                if (config.align) {
                    if (config.align == 'left') {
                        sn.x = -(this.node.width - sn.width) / 2 + sn.hSpace;
                    } else if (config.align == 'right') {
                        sn.x = (this.node.width - sn.width) / 2 - sn.hSpace;
                    } else if (config.align == 'center') {
                        sn.x = 0;
                    }
                } else {
                    sn.x = 0;
                }
                var startLine = 0;
                if (config.startLine) {
                    var stl = parseInt(config.startLine);
                    startLine = stl > 0 ? stl : 0;
                }
                var mh = Math.ceil(sn.height / this._lineHeight);
                sn.oy = -parseInt(startLine) * this._lineHeight - (mh * this._lineHeight - sn.height) / 2;
                sn.startLine = startLine;
                sn.occupyLine = mh;
                this._updateSelfBox();
                this._updateAnchorPoint();
                this._renderDebugLine();

                for (var j = 0; j < sn.occupyLine; j++) {
                    this._updateOccupySpace(sn.startLine + j, sn.x - sn.width / 2 - sn.hSpace, sn.x + sn.width / 2 + sn.hSpace);
                }
            }
        }
    },

    //重置空间占用记录
    _resetOccupySpace() {
        this._occupySpaceMem = {};
    },

    //更新空间占用记录
    _updateOccupySpace(lineIndex, intervalLeft, intervalLeftRight) {
        if (!this._occupySpaceMem[lineIndex]) {
            this._occupySpaceMem[lineIndex] = [];
        }
        this._occupySpaceMem[lineIndex].push([intervalLeft, intervalLeftRight]);
        this._occupySpaceMem[lineIndex] = this._occupySpaceMem[lineIndex].sort(function (a, b) { return a[0] - b[0]; });

        //合并重叠区间
        var sIList = [];
        for (var i = 0, c, n; i < this._occupySpaceMem[lineIndex].length - 1; i++) {
            c = this._occupySpaceMem[lineIndex][i], n = this._occupySpaceMem[lineIndex][i + 1];

            if (n[0] <= c[1]) {
                if (sIList.length > 0) {
                    sIList[sIList.length - 1][1] = Math.max(sIList[sIList.length - 1][1], n[1]);
                } else {
                    sIList.push([c[0], Math.max(c[1], n[1])]);
                }
            } else {
                if (sIList.length > 0) {
                    sIList.push(n);
                } else {
                    sIList.push(c);
                    sIList.push(n);
                }
            }
        }
    },

    //获取未占用的空间
    _getNoOccupySpace(lineIndex, start, width, breakNum) {
        breakNum = breakNum || 0;
        width = width > this.node.width ? this.node.width : width;
        var os = this._occupySpaceMem[lineIndex];
        var ll = start, rr = start + width;
        var r = { noOccupyPos: 0, lineIndex: lineIndex, breakNum: breakNum };
        if (breakNum > 20) {
            return r;
        }
        if (os instanceof Array) {
            for (var i = 0, osil, osir, ll, rr; i < os.length; i++) {
                osil = os[i][0], osir = os[i][1];
                if (rr <= osil) {
                    r.noOccupyPos = ll;
                    break;
                } else if (rr > osil && rr <= osir + width) {
                    r.noOccupyPos = osir;
                    rr = osir + width;
                    ll = osir;
                } else if (rr > osir + width) {
                    r.noOccupyPos = ll;
                }
            }
        } else {
            r.noOccupyPos = ll;
        }
        if (r.noOccupyPos + width > this.node.width * this.node.anchorX) {//当前行已经排满
            return this._getNoOccupySpace(lineIndex + 1, this._cHPosRaw, width, ++breakNum);
        }
        return r;
    },

    _getASpriteNode() {
        var r;
        if (this._snpool.size() > 0) {
            r = this._snpool.get();
        } else {
            r = new cc.PrivateNode();
            r.rc = r.addComponent(cc.Sprite);
        }
        return r;
    },

    _recycleASpriteNode(node) {
        this._snpool.put(node);
    },

    _getALabelNode() {
        var r, rc;
        if (this._tnpool.size() > 0) {
            r = this._tnpool.get();
            rc = r.rc;
        } else {
            r = new cc.PrivateNode();
            rc = r.rc = r.addComponent(cc.Label);
        }

        rc.font = this.font;
        rc.fontFamily = this.fontFamily;
        rc.cacheMode = cc.Label.CacheMode.CHAR;
        rc.lineHeight = this._lineHeight;
        r.color = this._fontColor;
        rc.fontSize = this._fontSize;
        rc.string = '';
        rc.verticalAlign = cc.Label.VerticalAlign.CENTER;
        return r;
    },

    _recycleALabelNode(node) {
        this._tnpool.put(node);
    },

    _getAInputNode() {
        var r;
        if (this._inpool.size() > 0) {
            r = this._inpool.get();
        } else {
            r = new cc.PrivateNode();
            r.rc = r.addComponent(cc.Graphics);
        }
        r.isInputBox = true;
        return r;
    },

    _recycleAInputNode(node) {
        node.inputContent = '';
        node.labels = null;
        node.contents = null;
        this._inpool.put(node);
    },

    //获取并显示文档流
    _showAllContent() {
        var flow = this._contentRaw.flow;
        this._reSetCCPos();
        this._resetInputBoxsFocus();
        for (var i = 0, cItem; i < flow.length; i++) {
            cItem = flow[i];
            if (cItem != NaN) {
                this._showNextContent(cItem);
                this._updateSelfBox();
                this._updateAnchorPoint();
                this._renderDebugLine();
            }
        }

        this._findAllInputNodes();
    },

    //查找所有的输入节点
    _findAllInputNodes() {
        this._allInputNodesMap = {};
        this._allInputNodes = this.node.children.filter(function (e) {
            return e.isInputBox;
        });
        this._allInputNodes.forEach(function (e) {
            this._allInputNodesMap[e.ipID] = e;
        }, this);
    },

    //获取所有的输入节点
    _getAllInputNodes() {
        return this._allInputNodes || [];
    },

    //根据ID获取输入框
    _getInputBoxByID(id) {
        return this._allInputNodesMap[id];
    },

    //重置当前文档流位置
    _reSetCCPos() {
        this._lineIndex = 0;
        this._cHPosRaw = this._cHPos = -this.node.width / 2;
        this._charCount = 0;
    },

    //更新当前文档流位置
    _updateCCPos(charWidth, ignoreWordSpace) {
        var spaceToFront = this._charCount > 0 && !ignoreWordSpace ? this._wordSpace : 0;
        var nos = this._getNoOccupySpace(this._lineIndex, this._cHPos + spaceToFront, charWidth);
        this._lineIndex = nos.lineIndex;
        var r = {
            y: -(this._lineIndex + 0.5) * this._lineHeight,
            x: nos.noOccupyPos + charWidth / 2,
            lineIndex: this._lineIndex
        }
        this._cHPos = nos.noOccupyPos + charWidth;
        if (nos.breakNum > 0) {
            this._charCount = 1;
        } else {
            this._charCount++;
        }
        return r;
    },

    //换行
    _breakLine(newline) {
        this._lineIndex = newline ? newline : this._lineIndex + 1;
        this._cHPos = -this.node.width / 2;
        this._charCount = 0;
    },

    //获取当前行位置
    _getCurrentLine() {
        return this._lineIndex;
    },

    //是否需要换行
    _isNeedANewLine() {
        return this._charCount > 0;
    },

    //获取指定位置连续的几个文档流位置
    _getCCPosByIndex(lineIndex, startPos, charWidths, ignoreWordSpace) {
        var spaceToFront = ignoreWordSpace ? 0 : this._wordSpace;
        var r = [], nos;
        if (charWidths instanceof Array) {
            for (var i = 0, charWidth; i < charWidths.length; i++) {
                charWidth = charWidths[i];
                nos = this._getNoOccupySpace(lineIndex, startPos + spaceToFront, charWidth);
                lineIndex = nos.lineIndex;
                startPos = nos.noOccupyPos + charWidth;
                r.push({
                    y: -(lineIndex + 0.5) * this._lineHeight,
                    x: nos.noOccupyPos + charWidth / 2,
                    lineIndex: lineIndex
                });
            }
        }

        return r;
    },

    //获取指定行的所有可用文档流位置
    _getAllAPosByLine(lineIndex, charWidth, ignoreWordSpace) {
        var spaceToFront = ignoreWordSpace ? 0 : this._wordSpace;
        var startPos = this._cHPosRaw;
        var r = [], nos;
        var isContinue = true;
        while (isContinue) {
            nos = this._getNoOccupySpace(lineIndex, startPos + spaceToFront, charWidth);
            if (nos.breakNum == 0) {
                startPos = nos.noOccupyPos + charWidth;
                r.push({
                    y: -(lineIndex + 0.5) * this._lineHeight,
                    x: nos.noOccupyPos + charWidth / 2,
                    lineIndex: lineIndex
                });
            } else {
                isContinue = false;
            }
        }
        return r;
    },

    //获取并显示下一个文档流内容
    _showNextContent(cItem) {
        if (cItem.name == 'icon') {
            this._showAIcon(cItem);
        } else if (cItem.name == 'input') {
            this._showAInputBox(cItem);
        } else if (cItem.name == 'img') {
            this._showAImage(cItem);
        } else if (cItem.name == 'text') {
            this._showALabel(cItem);
        } else if (cItem.name == 'divider') {
            this._showADivider(cItem);
        } else if (cItem.name == 'br') {
            this._breakLine();
        }
    },

    //显示一个文本内容
    _showALabel(cItem, ignoreWordSpace) {
        var ln = this._getALabelNode();
        var lnc = ln.rc;
        lnc.string = cItem.char;
        this.node.addChild(ln);

        var style = this._getStyleAt(cItem.index);
        ln.color = style.color;
        lnc.fontSize = style.fontSize;

        lnc._updateRenderData(true);

        var rpos = this._updateCCPos(ln.width, ignoreWordSpace);
        ln.x = rpos.x;
        ln.oy = rpos.y;
        ln.startLine = rpos.lineIndex;

        return ln;
    },

    //显示一个图标
    _showAIcon(cItem) {
        var ico = this._getASpriteNode();
        var icoc = ico.rc;
        icoc.type = cc.Sprite.Type.SLICED;
        icoc.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        ico.setAnchorPoint(0.5, 0.5);
        ico.name = cItem.content;
        this.node.addChild(ico);
        var sp = this._resMap[cItem.content];
        if (sp) {
            icoc.spriteFrame = sp;
            var ratio = sp._originalSize.width / sp._originalSize.height;
            var h = cItem.h && parseInt(cItem.h);
            var w = cItem.w && parseInt(cItem.w);
            var rh = h;
            if (h && !w) {
                rh = h;
            } else if (w && !h) {
                rh = w / ratio;
            } else if (w && h) {
                rh = Math.min(w / ratio, h);
            } else {
                rh = sp._originalSize.height;
            }
            rh = Math.min(rh, this._lineHeight);
            ico.setContentSize(rh * ratio, rh);
        } else {
            ico.setContentSize(2, 2);
        }
        var hSpace = 0;
        if (cItem.hSpace) {
            hSpace = parseInt(cItem.hSpace);
            hSpace = hSpace > 0 ? hSpace : 0;
        }
        ico.hSpace = hSpace;
        if (cItem.align) {
            if (cItem.align == 'top') {
                ico.oyf = (this._lineHeight - ico.height) / 2;
            } else if (cItem.align == 'bottom') {
                ico.oyf = -(this._lineHeight - ico.height) / 2;
            } else if (cItem.align == 'center') {
                ico.oyf = 0;
            }
        } else {
            ico.oyf = 0;
        }
        var rpos = this._updateCCPos(ico.width + ico.hSpace * 2);
        ico.x = rpos.x;
        ico.oy = rpos.y + ico.oyf;
        ico.startLine = rpos.lineIndex;
    },

    //处理文档流中的图片
    _showAImage(cItem) {
        var sn = this._getASpriteNode();
        var snc = sn.rc;
        snc.type = cc.Sprite.Type.SLICED;
        snc.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        sn.setAnchorPoint(0.5, 1);
        sn.name = cItem.content;
        this.node.addChild(sn);
        var sp;
        if (sp = this._resMap[cItem.content]) {
            snc.spriteFrame = sp;
            var ratio = sp._originalSize.width / sp._originalSize.height;
            var h = cItem.h && parseInt(cItem.h);
            var w = cItem.w && parseInt(cItem.w);
            if (h && !w) {
                sn.setContentSize(h * ratio, h);
            } else if (w && !h) {
                sn.setContentSize(w, w / ratio);
            } else if (w && h) {
                sn.setContentSize(w, h);
            } else {
                sn.setContentSize(sp._originalSize);
            }
        } else {
            sn.setContentSize(2, 2);
        }
        var hSpace = 0;
        if (cItem.hSpace) {
            hSpace = parseInt(cItem.hSpace);
            hSpace = hSpace > 0 ? hSpace : 0;
        }
        sn.hSpace = hSpace;
        if (cItem.align) {
            if (cItem.align == 'left') {
                sn.x = -(this.node.width - sn.width) / 2 + sn.hSpace;
            } else if (cItem.align == 'right') {
                sn.x = (this.node.width - sn.width) / 2 - sn.hSpace;
            } else if (cItem.align == 'center') {
                sn.x = 0;
            }
        } else {
            sn.x = 0;
        }
        this._isNeedANewLine() && this._breakLine();//换行
        var rpos = this._updateCCPos(sn.width + sn.hSpace * 2);

        var mh = Math.ceil(sn.height / this._lineHeight);
        sn.oy = -rpos.lineIndex * this._lineHeight - (mh * this._lineHeight - sn.height) / 2;
        sn.startLine = rpos.lineIndex;
        sn.occupyLine = mh;

        this._breakLine(sn.startLine + sn.occupyLine);//换行
    },

    //显示一条分割线
    _showADivider(cItem) {
        var sn = this._getASpriteNode();
        var snc = sn.rc;
        snc.type = cc.Sprite.Type.SLICED;
        snc.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        sn.setAnchorPoint(0.5, 0.5);
        this.node.addChild(sn);
        var sp;
        if (sp = this._resMap[cItem.content]) {
            snc.spriteFrame = sp;
            var ratio = sp._originalSize.width / sp._originalSize.height;
            var h = cItem.h && parseInt(cItem.h);
            var w = cItem.w && parseInt(cItem.w);
            if (h && !w) {
                sn.setContentSize(h * ratio, h);
            } else if (w && !h) {
                sn.setContentSize(w, w / ratio);
            } else if (w && h) {
                sn.setContentSize(w, h);
            } else {
                sn.setContentSize(sp._originalSize);
            }
        } else {
            sn.setContentSize(100, 2);
        }
        var gap = 0;
        if (cItem.gap) {
            gap = parseInt(cItem.gap);
            gap = gap > 0 ? gap : 0;
        }
        sn.gap = gap;
        sn.oyf = 0;
        if (cItem.align) {
            var align = parseFloat(cItem.align);
            align = align > 1 ? 1 : align < 0 ? 0 : align;
            sn.oyf = (align - 0.5) * (this._lineHeight - sn.height);
        }
        this._isNeedANewLine() && this._breakLine();
        var startLine = this._getCurrentLine();

        var rpos = this._getAllAPosByLine(startLine, sn.width + sn.gap * 2, true);

        for (var i = 0, tt = sn; i < rpos.length; i++) {
            if (i > 0) {
                tt = cc.instantiate(sn);
                this.node.addChild(tt);
            }
            tt.x = rpos[i].x;
            tt.oy = rpos[i].y + sn.oyf;
            tt.startLine = rpos[i].lineIndex;
        }

        this._breakLine();
    },

    //显示一个输入框
    _showAInputBox(cItem) {
        var content = cItem.content || '____';
        var labels = [], inputBoxLength = 0;
        for (var i = 0, l; i < content.length; i++) {
            l = this._showALabel({ char: content[i], index: cItem.cStartIndex + i }, i > 0 ? true : false);
            labels.push(l);
            inputBoxLength += l.width;
        }

        var inp = this._getAInputNode();
        var inpc = inp.rc;

        inp.ipID = cItem.id;
        inp.name = cItem.id;
        inp.rawData = cItem;

        inpc.strokeColor = cc.Color.WHITE;
        if (cItem.color) {
            inpc.strokeColor = new cc.Color();
            inpc.strokeColor.fromHEX(cItem.color);
            inpc.fillColor = inpc.strokeColor;
        } else {
            inpc.strokeColor = labels[0].color;
            inpc.fillColor = labels[0].color;
        }

        if (cItem.focus) {
            this._updateInputBoxsFocus(inp);
            inp.active = true;
        } else {
            inp.active = false;
        }

        inp.setContentSize(this._lineHeight / 2, this._lineHeight);

        inpc.rect(-1, -labels[0].rc.fontSize * 0.35, 2, labels[0].rc.fontSize * 0.7);
        inpc.fill();

        inp.labels = labels;
        inp.inputBoxLength = inputBoxLength;

        this._renderInputBoxInput(inp, '');

        this.node.addChild(inp);
    },

    //渲染输入内容
    _renderInputBoxInput(inputBox, content) {
        if (inputBox) {
            content = content || '';
            var labels = inputBox.labels;
            var inputBoxLength = inputBox.inputBoxLength;

            if (inputBox.contents instanceof Array && inputBox.contents.length > 0) {
                inputBox.contents.forEach(function (e) {
                    this._recycleALabelNode(e);
                }, this);
            }

            var ncl = [], totalLength = 0, nContents = [], rContent = '';
            for (var i = 0; i < content.length; i++) {
                if(totalLength + labels[0].rc.fontSize > inputBoxLength){//进行长度限制
                    break;
                }
                var ln = this._getALabelNode();
                var lnc = ln.rc;
                lnc.string = content.substr(i, 1);
                this.node.addChild(ln);
                lnc._updateRenderData(true);

                ln.color = labels[0].color;
                lnc.fontSize = labels[0].rc.fontSize;

                ncl.push(ln.width);
                nContents.push(ln);
                totalLength += ln.width;

                rContent+=content.substr(i, 1);
            }
            totalLength += inputBox.width;
            ncl.push(inputBox.width);

            inputBox.contents = nContents;
            inputBox.inputContent = rContent;

            //计算初始行和初始位置
            var startLine = 0, startPos = 0;
            if (totalLength > inputBoxLength) {
                startLine = labels[0].startLine;
                startPos = labels[0].x - labels[0].width / 2;
            } else {
                var leftOffset = (inputBoxLength - totalLength) / 2.0;
                for (var i = 0, cl = 0; i < labels.length; i++) {
                    cl += labels[i].width;
                    if (cl > leftOffset) {
                        startLine = labels[i].startLine;
                        startPos = labels[i].x + labels[i].width / 2 - (cl - leftOffset);
                        break;
                    }
                }
            }

            var rPosInfo = this._getCCPosByIndex(startLine, startPos, ncl, true);

            for (var i = 0, nci, rpii; i < rPosInfo.length - 1; i++) {
                nci = nContents[i], rpii = rPosInfo[i];
                nci.x = rpii.x;
                nci.oy = rpii.y;
                nci.startLine = rpii.lineIndex;
            }

            var lPosInfo = rPosInfo[rPosInfo.length - 1];

            inputBox.x = lPosInfo.x;
            inputBox.oy = lPosInfo.y;
            inputBox.startLine = lPosInfo.lineIndex;
        }
        this._updateSelfBox();
        this._updateAnchorPoint();
        this._renderDebugLine();
    },

    //更新锚点
    _updateAnchorPoint() {
        var anchorX = 0.5, anchorY = 1;
        this.node.setAnchorPoint(anchorX, anchorY);

        this._yOffset = this.node.height * (anchorY - 0.5);

        this._getAllMNodes().forEach(function (e) {
            e.y = e.oy + this._yOffset;
        }, this);
    },

    _getAllMNodes() {
        return this.node.children.filter(function (e) {
            return e instanceof cc.PrivateNode;
        });
    },

    //更新大小
    _updateSelfBox() {
        var maxLine = 1, top, bottom;
        this._getAllMNodes().forEach(function (e) {
            top = e.startLine;
            bottom = top + (e.occupyLine || 1);
            maxLine = Math.max(bottom, maxLine);
        }, this);
        this.node.height = maxLine * this._lineHeight;
    },

    //绘制调试线
    _renderDebugLine() {
        if (this._debug) {
            cc.debug.setDisplayStats(this._debug);
            if (!this._graphic) {
                if (!(this._graphic = this.node.getComponent(cc.Graphics))) {
                    this._graphic = this.node.addComponent(cc.Graphics);
                }
                this._graphic.strokeColor = cc.Color.RED;
            }
            this._graphic.clear();
            this._graphic.circle(0, 0, 5);

            //绘制行线
            var tln = this.node.height / this._lineHeight;
            for (var i = 1; i < tln; i++) {
                this._graphic.moveTo(-this.node.width * this.node.anchorX, -i * this._lineHeight);
                this._graphic.lineTo(this.node.width * this.node.anchorX, -i * this._lineHeight);
            }
            this._graphic.rect(-this.node.width * this.node.anchorX, -this.node.height * this.node.anchorY, this.node.width, this.node.height);

            this._getAllMNodes().forEach(function (e) {
                this._graphic.rect(e.x - e.width * e.anchorX, e.y - this._yOffset - e.height * e.anchorY, e.width, e.height);
            }, this);
            this._graphic.stroke();
        } else {
            if (this._graphic = this.node.getComponent(cc.Graphics)) {
                this._graphic.clear();
            }
        }
    },

    //进行语义校验
    _verifyInput(input) {
        var verifyMem = [], canNest = true, isEmpty = false;
        for (var i = 0, t; i < input.length; i++) {
            t = input.charAt(i);
            if (this._isTagC(input, i, '[!')) {
                if (canNest && (verifyMem.length == 0 || verifyMem[verifyMem.length - 1] == '(')) {//记录标记开始位置
                    verifyMem.push('[');
                    //记录不可嵌套的状态
                    canNest = this._canNest(input, i + 2);
                    //记录
                    isEmpty = this._isEmpty(input, i + 2);
                } else {
                    return false;
                }
            } else if (this._isTagC(input, i, ']')) {
                if (verifyMem.length > 0 && verifyMem[verifyMem.length - 1] == '[') {//记录标记结束位置
                    if (this._isTagC(input, i, '](')) {//记录内容开始位置
                        if (!isEmpty) {
                            verifyMem.push(']');
                            verifyMem.push('(');
                        } else {
                            return false;
                        }
                    } else {
                        verifyMem.pop();
                        //释放不可嵌套的状态
                        canNest = true;
                    }
                } else {
                    return false;
                }
            } else if (this._isTagC(input, i, ')')) {//记录内容结束位置
                if (verifyMem.length > 2 && verifyMem[verifyMem.length - 1] == '(' && verifyMem[verifyMem.length - 2] == ']' && verifyMem[verifyMem.length - 3] == '[') {
                    verifyMem.pop();
                    verifyMem.pop();
                    verifyMem.pop();
                    //释放不可嵌套的状态
                    canNest = true;
                } else {
                    return false;
                }
            }
        }
        return verifyMem.length == 0;
    },

    //拆分语义块
    _splitInput(input) {
        var r = {
            settings: {},
            style: [],
            flow: [],
            surround: [],
            resList: []
        }
        for (var i = 0, tag, c, endS = []; i < input.length; i++) {
            if (endS.length > 0 && endS[endS.length - 1] == i) {//跳过内容结束点
                endS.pop();
                continue;
            }
            c = input.charAt(i);
            if (this._isTagStart(input, i)) {
                tag = this._findTag(input, i);
                i = tag.endIndex;
                if (tag.canNest) {
                    endS.push(tag.cEndIndex);
                }
                if (tag.name == 'settings') {
                    r.settings = tag;
                } else if (tag.name == 'img' && tag.type == 'surround') {
                    r.surround.push(tag);
                    r.resList.push(tag.content);
                } else if (tag.name == 'color' || tag.name == 'size' || tag.name == 'blob' || tag.name == 'italic') {
                    r.style.push(tag);
                } else if (tag.name == 'icon' || tag.name == 'img') {
                    r.flow.push(tag);
                    r.resList.push(tag.content);
                } else if (tag.name == 'input') {
                    r.flow.push(tag);
                } else if (tag.name == 'br') {
                    r.flow.push(tag);
                } else if (tag.name == 'divider') {
                    r.resList.push(tag.content);
                    r.flow.push(tag);
                }
            } else {
                r.flow.push({
                    name: 'text',
                    index: i,
                    char: c
                });
            }
        }
        //处理转义字符/[、/]、/(、/)
        r.flow = this._handleTagC(r.flow);

        return r;
    },

    //判断是否是标记字符
    _isTagC(input, index, charOrStr) {
        var l = charOrStr.length;
        var cStr = input.substr(index, l);
        for (var i = index - 1, count = 0; i > 0; i--) {
            if (input.charAt(i) != '\\') {
                break;
            } else {
                count++;
            }
        }
        return cStr == charOrStr && count % 2 == 0;
    },

    //处理转义字符
    _handleTagC(flow) {
        for (var i = 0, c, cn; i < flow.length - 1; i++) {
            c = flow[i].char;
            cn = flow[i + 1].char;
            if (c == '\\' && (cn == '[' || cn == ']' || cn == '(' || cn == ')')) {
                flow[i].char = NaN;
            }
        }
        return flow;
    },

    //是否不可嵌套
    _canNest(input, index) {
        return input.substr(index, 3) != 'img'
            && input.substr(index, 4) != 'icon'
            && input.substr(index, 5) != 'input'
            && input.substr(index, 7) != 'divider'
            && input.substr(index, 2) != 'br';
    },

    //是否无内容
    _isEmpty(input, index) {
        return input.substr(index, 2) == 'br'
            || input.substr(index, 8) == 'settings';
    },

    //判断是否是标记开始的位置
    _isTagStart(input, index) {
        return input.substr(index, 2) == '[!';
    },

    //识别标记
    _findTag(input, index) {
        var tag = {
            endIndex: index,
            cEndIndex: index,
            cStartIndex: index,
            canNest: true,
            isEmpty: false
        }
        tag.canNest = this._canNest(input, index + 2);
        tag.isEmpty = this._isEmpty(input, index + 2);
        for (var i = index + 2, t; i < input.length; i++) {
            if (!tag.canNest) {//读取不能嵌套的标记的内容
                if (this._isTagC(input, i, '](') && !tag.isEmpty) {
                    t = this._handleTagBody(input, index + 2, i);
                    tag = this._handleAttribute(tag, t);
                    var ct = this._findContent(input, i + 2, false);
                    tag.content = ct.content;
                    tag.endIndex = ct.endIndex;
                    tag.cEndIndex = ct.endIndex;
                    tag.cStartIndex = i + 2;
                    break;
                } else if (this._isTagC(input, i, ']') && tag.isEmpty) {//读取没有内容的嵌套标记
                    t = this._handleTagBody(input, index + 2, i);
                    tag = this._handleAttribute(tag, t);
                    tag.endIndex = i;
                    tag.cEndIndex = i;
                    tag.cStartIndex = i;
                    break;
                }
            } else {//读取能嵌套的标记的内容
                if (this._isTagC(input, i, '](') && !tag.isEmpty) {//读取有内容的嵌套标记
                    t = this._handleTagBody(input, index + 2, i);
                    tag = this._handleAttribute(tag, t);
                    var ct = this._findContent(input, i + 2, true);
                    tag.endIndex = i + 1;
                    tag.cEndIndex = ct.endIndex;
                    tag.cStartIndex = i + 2;
                    break;
                } else if (this._isTagC(input, i, ']') && tag.isEmpty) {//读取没有内容的嵌套标记
                    t = this._handleTagBody(input, index + 2, i);
                    tag = this._handleAttribute(tag, t);
                    tag.endIndex = i;
                    tag.cEndIndex = i;
                    tag.cStartIndex = i;
                    break;
                }
            }
        }
        return tag;
    },

    //处理标记体
    _handleTagBody(input, start, end) {
        var t = input.substr(start, end - start);
        t = t.replace(/\s+=\s+/gi, '=');
        t = t.split(' ').filter(function (e) { return e && e.length > 0; });
        return t;
    },

    //读取标记的内容
    _findContent(input, index, canNest) {
        var nestStack = [];
        var r = { content: '', endIndex: 0 };
        for (var i = index, c; i < input.length; i++) {
            c = input.charAt(i);
            if (this._isTagC(input, i, '[!')) {
                nestStack.push('[');
            } else if (this._isTagC(input, i, '](')) {
                nestStack.push(']');
                nestStack.push('(');
            } else if (this._isTagC(input, i, ']')) {
                nestStack.pop();
            } else if (this._isTagC(input, i, ')')) {
                if (nestStack.length == 0) {
                    r.endIndex = i;
                    break;
                } else {
                    nestStack.pop();
                    nestStack.pop();
                    nestStack.pop();
                }
            } else if (!canNest && nestStack.length == 0) {
                r.content += c;
            }
        }
        return r;
    },

    //读取标记的属性
    _handleAttribute(tag, tagBodyList) {
        tag.name = tagBodyList.shift();
        var map = {
            settings: this._handleNormalTag,
            color: this._handleOmitTag,
            size: this._handleOmitTag,
            input: this._handleNormalTag,
            img: this._handleNormalTag,
            icon: this._handleNormalTag,
            blob: this._handleDefaultTag,
            italic: this._handleDefaultTag,
            divider: this._handleNormalTag
        };

        return map[tag.name] ? map[tag.name](tag, tagBodyList) : tag;
    },

    //读取通用的属性
    _handleNormalTag(tag, tagBodyList) {
        for (var i = 0, tt; i < tagBodyList.length; i++) {
            tt = tagBodyList[i].split('=');
            if (tt.length == 2 && tt[0] && tt[1]) {
                tag[tt[0].replace(/\r*/gi, '')] = tt[1];
            }
        }
        return tag;
    },

    //读取省略属性的属性
    _handleOmitTag(tag, tagBodyList) {
        if (tagBodyList.length > 0) {
            tag.value = tagBodyList[0];
        }
        return tag;
    },

    //读取默认的属性
    _handleDefaultTag(tag) {
        tag.value = true;
        return tag;
    },

    //绘制输入框焦点
    _renderInputBoxFocus(dt) {
        if (this._focusInputBox) {
            this._renderFIBTime += dt;
            if (this._renderFIBTime > (this._focusInputBox.active ? 0.65 : 0.4)) {
                this._focusInputBox.active = !this._focusInputBox.active;
                this._renderFIBTime = 0;
            }
        }
    },

    update(dt) {
        this._renderInputBoxFocus(dt);
    }
});
