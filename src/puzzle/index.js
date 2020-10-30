/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./src/index.ts");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./src/content.ts":
/*!************************!*\
  !*** ./src/content.ts ***!
  \************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
Object.defineProperty(exports, "__esModule", { value: true });
var mapBase = [
    '@           0 4                              #  $ + 5 ',
    '          4    #             0          .     ## #   #',
    '               +              +          6 $ #      # ',
    '                                          0  #        ',
    '# +                                      .            ',
    '                                              #       ',
    '4          +                 +            +    5      ',
    '               # #          ##                        ',
    '# +     1     +   #            0             # #      ',
    '                           #+                 #       ',
    '3      2     .                                       #',
    '            #     +   #                           #   ',
    '  #     # 4    +    #  #    5                         ',
    '            0 #    2                      $ #        #',
    '          #      +      # # 6 ### #$## ##        # # #',
    '     # $ #        #   3  # # #   0    #  # $ ####   6 ',
    '           #     # # #  #   #                     $   ',
    '       #        3 $ $ ##     +        #    +          ',
    ' #             # #   0   +     #                    6 ',
    '5 #####  # #### #                +    6   #           ',
    '           #         +       0                  ## $  ',
    '# 6     +   5 0 #     #    #           #              ',
];
var mapSize = [mapBase.length, mapBase[0].length];
var trophyCount = mapBase.reduce(function (sum, row) { return sum + Array.from(row).filter(function (c) { return c == '$'; }).length; }, 0);
var trophyLevelCount = 6;
var trophyLevelRequirements = [1, 2, 4, 6, 8, 10];
var trophyIconSize = [8, 12];
var trophyIconBase = String.raw(templateObject_1 || (templateObject_1 = __makeTemplateObject(["\n|            |            |            |            |     __     |   /''''   |\n|            |            |            |            |   /'  \\   |  /  /    |\n|            |            |            |    ____    |  ____//_  |    /  /  |\n|            |            |     /-    |  /| .. |  | | | LD | | |      /   |\n|            |      _     |    [_/]   |  | .. |/  |  | 45 |/  | -/  \\-/ |\n|      _     |     /=    |      /    |       /   |       /   | /- __ /- |\n|     {1}    |     \"/    |     |X|    |    |__|    |    |__|    |    |__|    |\n|      \"     |     /_    |     [_]    |   /____   |   /____   |   /____   |\n"], ["\n|            |            |            |            |     __     |   /''''\\   |\n|            |            |            |            |   /'  \\\\   |  /  /\\  \\  |\n|            |            |            |    ____    |  _\\___//_  |  \\  \\/  /  |\n|            |            |     /-\\    |  /| .. |\\  | | | LD | | |   \\  \\ /   |\n|            |      _     |    [\\_/]   |  \\| .. |/  |  \\| 45 |/  | \\-/\\  \\\\-/ |\n|      _     |     /=\\    |     \\ /    |   \\    /   |   \\    /   | /-\\ __ /-\\ |\n|     {1}    |     \\\"/    |     |X|    |    |__|    |    |__|    |    |__|    |\n|      \"     |     /_\\    |     [_]    |   /____\\   |   /____\\   |   /____\\   |\n"])));
var trophyIcons = trophyIconBase.substring(1, trophyIconBase.length - 1);
// sanity check
if (mapBase.some(function (r) { return r.length != mapSize[1]; })) {
    console.log('map column incorrect');
}
if (mapSize[0] != 22 || mapSize[1] != 54) {
    console.log('map size incorrect');
}
if (trophyCount != 10) {
    console.log('map trophy incorrect');
}
if (trophyLevelCount != trophyLevelRequirements.length) {
    console.log('trophy level count and requirements length incorrect');
}
if (trophyLevelRequirements[trophyLevelCount - 1] != trophyCount) {
    console.log('trophy level max requirement and trophy count not correct');
}
exports.content = {
    MapSize: mapSize,
    Map: mapBase,
    TrophyLevelCount: trophyLevelCount,
    TrophyLevelRequirements: trophyLevelRequirements,
    TrophyIconSize: trophyIconSize,
    TrophyIcons: trophyIcons,
};
var templateObject_1;


/***/ }),

/***/ "./src/game.ts":
/*!*********************!*\
  !*** ./src/game.ts ***!
  \*********************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
var content_1 = __webpack_require__(/*! ./content */ "./src/content.ts");
var util_1 = __webpack_require__(/*! ./util */ "./src/util.ts");
var Game = /** @class */ (function () {
    function Game(target) {
        var _this = this;
        this.handleClick = function (e) {
            if (e.target != _this.target.main && e.target != _this.target.top) {
                return;
            }
            var _a = _this.state, cells = _a.cells, level = _a.level, initialAlpha = _a.initialAlpha;
            if (level == -1 && parseInt(initialAlpha.toString()) != 10) {
                return _this.setState({ initialAlpha: initialAlpha + 1 });
            }
            if (level == -1 /* initialAlpha == 10 */) {
                var newCells = [{ position: [3, 41], type: 'dot-source', display: 'active', beaconValue: 0 }];
                return _this.setState({ cells: newCells, level: 0 });
            }
            if (level == 0) {
                var position = [0, 0];
                if (position[0] == -1) {
                    return;
                }
                var cell_1 = _this.getCell(position);
                if (!cell_1) {
                    return;
                }
                if (cell_1.type == 'dot-source' || cell_1.type == 'dot') {
                    var endOfDotColumn = util_1.range(cell_1.position[1] - 1, 0, -1).find(function (c) { var _a; return ((_a = _this.getCell([cell_1.position[0], c])) === null || _a === void 0 ? void 0 : _a.type) != 'dot'; });
                    if (!endOfDotColumn || endOfDotColumn == 0) {
                        return; // dot has reached left end of map, nothing happens
                    }
                    var tobeDotCell = _this.getCell([cell_1.position[0], endOfDotColumn - 1]);
                    if (tobeDotCell) {
                        // if the cell exists, all type will prevent dot from increasing, nothing happens
                        return;
                    }
                    var cellConfig = content_1.content.Map[cell_1.position[0]][endOfDotColumn - 1];
                    if (cellConfig == '') {
                        // expand dot
                        cells.push({
                            position: [cell_1.position[0], endOfDotColumn - 1],
                            type: 'dot',
                            display: 'revealed',
                            beaconValue: 0,
                        });
                    }
                    if (cellConfig == '+') {
                        // hit pipe source, create an active unknown
                        cells.push({
                            position: [cell_1.position[0], endOfDotColumn - 1],
                            type: 'pipe-source',
                            display: 'inactive',
                            beaconValue: 0,
                        });
                    }
                    if (/\d/.test(cellConfig)) {
                        var beaconValue = parseInt(cellConfig);
                        if (beaconValue == 0) {
                            // hit untouched 0, reveal it
                            cells.push({
                                position: [cell_1.position[0], endOfDotColumn - 1],
                                type: 'zero',
                                display: 'revealed',
                                beaconValue: 0,
                            });
                        }
                        else if (beaconValue >= level) {
                            // hit beacon, creates an active unknown
                            cells.push({
                                position: [cell_1.position[0], endOfDotColumn - 1],
                                type: 'beacon',
                                display: 'inactive',
                                beaconValue: beaconValue,
                            });
                        }
                    }
                }
            }
        };
        this.render = function (time) {
            var _a = _this.target, mx = _a.mainContext, px = _a.topContext, tx = _a.testContext;
            console.log('render: ', { time: time });
            do {
                if (_this.schedule.length == 0) {
                    break;
                }
                if (_this.schedule.length == 1 && _this.schedule[0].type == 'initial-sentence') {
                    px.globalAlpha = _this.schedule[0].initialSentenceAlpha;
                    px.clearRect(0, 0, 400, 400);
                    px.fillText('This page is intentionally left blank.', 30, 50);
                    break;
                }
            } while (false);
            _this.animationFrameCallbackHandler = null;
            _this.schedule = [];
        };
        this.state = {
            cells: [],
            level: -1,
            initialAlpha: 0,
            dotMode: 'expand',
            sliderPosition: [0, 0],
            trophy: 0,
        };
        this.target = __assign(__assign({}, target), { mainContext: target.main.getContext('2d'), topContext: target.top.getContext('2d'), testContext: target.test.getContext('2d') });
        this.schedule = [];
        this.animationFrameCallbackHandler = null;
    }
    Game.prototype.init = function () {
        var e_1, _a, e_2, _b;
        document.onclick = this.handleClick;
        try {
            for (var _c = __values([this.target.mainContext, this.target.topContext, this.target.testContext]), _d = _c.next(); !_d.done; _d = _c.next()) {
                var context = _d.value;
                context.font = '12px consolas';
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
            }
            finally { if (e_1) throw e_1.error; }
        }
        var metrics = this.target.testContext.measureText('|');
        var textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
        var y = 20;
        try {
            for (var _e = __values(content_1.content.TrophyIcons.split('\n')), _f = _e.next(); !_f.done; _f = _e.next()) {
                var trophyIconRow = _f.value;
                this.target.testContext.fillText(trophyIconRow, 0, y);
                y += textHeight;
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (_f && !_f.done && (_b = _e.return)) _b.call(_e);
            }
            finally { if (e_2) throw e_2.error; }
        }
        return this;
    };
    Game.prototype.start = function () {
        this.setState({});
    };
    Game.prototype.getCell = function (position) {
        return this.state.cells.find(function (c) { return c.position[0] == position[0] && c.position[1] == position[1]; });
    };
    Game.prototype.setState = function (newPartialState) {
        var newState = Object.assign(__assign(__assign({}, this.state), { cells: this.state.cells.map(function (c) { return (__assign({}, c)); }) }), newPartialState);
        do {
            if (newState.level == -1 && newState.initialAlpha != 0) { // initial sentence alpha increase, schedule may contain element
                if (this.schedule.length == 0) {
                    this.schedule = [{ type: 'initial-sentence', initialSentenceAlpha: newState.initialAlpha / 10 }];
                    break;
                }
                else {
                    this.schedule[0].initialSentenceAlpha = newState.initialAlpha / 10;
                }
            }
        } while (false);
        Object.assign(this.state, newState);
        if (this.schedule.length != 0 && !this.animationFrameCallbackHandler) {
            console.log('schedule: ', JSON.parse(JSON.stringify(this.schedule)));
            this.animationFrameCallbackHandler = requestAnimationFrame(this.render);
        }
    };
    return Game;
}());
exports.Game = Game;


/***/ }),

/***/ "./src/index.ts":
/*!**********************!*\
  !*** ./src/index.ts ***!
  \**********************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
var ui_1 = __webpack_require__(/*! ./ui */ "./src/ui.ts");
var game_1 = __webpack_require__(/*! ./game */ "./src/game.ts");
new game_1.Game({
    main: document.querySelector('canvas#main-layer'),
    top: document.querySelector('canvas#top-layer'),
    test: document.querySelector('canvas#test-layer')
})
    .init()
    .start();
var elements = (_a = {},
    _a['powers-container'] = document.getElementById('powers-container'),
    _a['power-containers'] = document.getElementsByClassName('power-container'),
    _a['power-2-button'] = document.getElementById('power-2-button'),
    _a['power-3-checkbox'] = document.getElementById('power-3-check'),
    _a['trophy-container'] = document.getElementById('trophy-container'),
    _a['trophy-money'] = document.getElementById('trophy-money'),
    _a['trophy-case'] = document.getElementById('trophy-case'),
    _a['trophy-next'] = document.getElementById('trophy-next'),
    _a['main-container'] = document.getElementById('main-container'),
    _a);
var ClassNames;
(function (ClassNames) {
    ClassNames["Faint"] = "faint";
    ClassNames["Slider"] = "slider";
    ClassNames["Invisible"] = "invisible";
    ClassNames["BeaconDisabled"] = "beacon-disabled";
})(ClassNames || (ClassNames = {}));
var CellBeaconTypes = ['disabled', 'inactive', 'active', 'level-finished'];
var Cell = /** @class */ (function () {
    function Cell(row, column, element, display, char) {
        this.row = row;
        this.column = column;
        this.element = element;
        this.display = display;
        this.char = char;
    }
    Object.defineProperty(Cell.prototype, "isInitialSentence", {
        get: function () { return /[Ta-z]/.test(this.char); },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Cell.prototype, "isBeacon", {
        get: function () { return /\d/.test(this.char); } // beacon is number
        ,
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Cell.prototype, "isBeaconActive", {
        get: function () { return this.isBeacon && hasVisibleNeighbour(this); },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Cell.prototype, "isClear", {
        get: function () { return /[ NSEW]/.test(this.char); } // Checks if a cell on the game.cells is isClear of obstacles
        ,
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Cell.prototype, "interactive", {
        set: function (value) {
            value ? this.element.classList.add('interactive') : this.element.classList.remove('interactive');
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Cell.prototype, "beaconType", {
        get: function () {
            var e_1, _a;
            try {
                for (var CellBeaconTypes_1 = __values(CellBeaconTypes), CellBeaconTypes_1_1 = CellBeaconTypes_1.next(); !CellBeaconTypes_1_1.done; CellBeaconTypes_1_1 = CellBeaconTypes_1.next()) {
                    var value = CellBeaconTypes_1_1.value;
                    if (this.element.classList.contains('beacon-' + value)) {
                        return value;
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (CellBeaconTypes_1_1 && !CellBeaconTypes_1_1.done && (_a = CellBeaconTypes_1.return)) _a.call(CellBeaconTypes_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
        },
        set: function (value) {
            var e_2, _a;
            this.element.classList.add('beacon-' + value);
            try {
                for (var _b = __values(CellBeaconTypes.filter(function (t) { return t != value; })), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var otherValue = _c.value;
                    this.element.classList.remove('beacon-' + otherValue);
                }
            }
            catch (e_2_1) { e_2 = { error: e_2_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_2) throw e_2.error; }
            }
        },
        enumerable: true,
        configurable: true
    });
    Cell.prototype.refresh = function () {
        this.element.innerHTML = this.char;
        this.interactive = isInteractive(this);
    };
    return Cell;
}());
var GameOld = /** @class */ (function () {
    function GameOld() {
        var e_3, _a;
        var cells = [];
        var beacons = [[], [], [], [], [], [], []];
        var _loop_1 = function (rowIndex, rowConfig) {
            var e_4, _a;
            var rowCells = [];
            var _loop_2 = function (columnIndex, cellConfig) {
                var element = document.createElement('span');
                element.classList.add('cell');
                element.onclick = function () {
                    onSpanClick(rowIndex, columnIndex);
                };
                element.oncontextmenu = function (e) {
                    for (var i = 0; i < 10; ++i) {
                        onSpanClick(rowIndex, columnIndex);
                    }
                    e.preventDefault();
                    e.stopPropagation();
                };
                elements['main-container'].appendChild(element);
                var cell = new Cell(rowIndex, columnIndex, element, 'hidden', cellConfig);
                if (cell.isBeacon) {
                    beacons[parseInt(cell.char)].push(cell);
                    element.classList.add('beacon');
                }
                rowCells.push(cell);
            };
            try {
                for (var _b = (e_4 = void 0, __values(Array.from(rowConfig).entries())), _c = _b.next(); !_c.done; _c = _b.next()) {
                    var _d = __read(_c.value, 2), columnIndex = _d[0], cellConfig = _d[1];
                    _loop_2(columnIndex, cellConfig);
                }
            }
            catch (e_4_1) { e_4 = { error: e_4_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
                }
                finally { if (e_4) throw e_4.error; }
            }
            cells.push(rowCells);
        };
        try {
            for (var _b = __values(ui_1.MAP_SCHEMATIC.entries()), _c = _b.next(); !_c.done; _c = _b.next()) {
                var _d = __read(_c.value, 2), rowIndex = _d[0], rowConfig = _d[1];
                _loop_1(rowIndex, rowConfig);
            }
        }
        catch (e_3_1) { e_3 = { error: e_3_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_3) throw e_3.error; }
        }
        // Reveal the first part of the game.cells: the first sentence
        for (var i = 3; i < 42; i++) {
            cells[4][i].display = 'visible';
        }
        this.cells = cells;
        this.beacons = beacons;
        this._slider = cells[0][0];
        this._powerLevel = 0;
    }
    GameOld.prototype.refreshSlider = function () {
        // Update the cells around the slider. Adds NSEW and makes neighbours visible.
        var _a, _b, _c, _d;
        var _e = getNeighbours(this._slider), left = _e.left, right = _e.right, up = _e.up, down = _e.down;
        if ((_a = up) === null || _a === void 0 ? void 0 : _a.isClear) {
            up.element.innerHTML = up.char = 'N';
            right.interactive = true;
            up.display = 'visible';
        }
        if ((_b = down) === null || _b === void 0 ? void 0 : _b.isClear) {
            down.element.innerHTML = down.char = 'S';
            right.interactive = true;
            down.display = 'visible';
        }
        if ((_c = right) === null || _c === void 0 ? void 0 : _c.isClear) {
            right.element.innerHTML = right.char = 'E';
            right.interactive = true;
            right.display = 'visible';
        }
        if ((_d = left) === null || _d === void 0 ? void 0 : _d.isClear) {
            left.element.innerHTML = left.char = 'W';
            right.interactive = true;
            left.display = 'visible';
        }
    };
    GameOld.prototype.refreshCells = function () {
        // Updates the visibility of the entire game.cells.
        var e_5, _a, e_6, _b;
        if (this._powerLevel >= 4) { // slider requires power level 4
            // Initialise the slider.
            this._slider.display = 'visible';
            this._slider.element.classList.remove(ClassNames.Faint);
            this._slider.element.classList.add(ClassNames.Slider);
            this.refreshSlider();
            this._slider.refresh();
        }
        try {
            for (var _c = __values(this.cells), _d = _c.next(); !_d.done; _d = _c.next()) {
                var row = _d.value;
                try {
                    for (var row_1 = (e_6 = void 0, __values(row)), row_1_1 = row_1.next(); !row_1_1.done; row_1_1 = row_1.next()) {
                        var cell = row_1_1.value;
                        // Check if any cells need to be promoted in visibility.
                        if (cell.display === 'hidden') {
                            // Check if should be revealed? When next to a visible and active char
                            if (hasVisibleNeighbour(cell)) {
                                // Empty cells and 0-beacons get fully revealed immediately.
                                // Other non-empty cells get ?
                                cell.display = (cell.char === ' ' || cell.char === '0') ? 'visible' : 'unknown';
                            }
                            else if ((this._powerLevel > 0 && hasVisibleNeighbour(cell, 2)) || this._powerLevel >= 5) {
                                // With Perception +, may check distance 2.
                                // With Perception ++, can see the entire game.cells faintly.
                                if (cell.char === ' ' || cell.char === '0') {
                                    cell.display = 'visible'; // Reveal some cells immediately.
                                }
                                else {
                                    cell.display = 'faint';
                                    cell.element.classList.add(ClassNames.Faint);
                                }
                            }
                        }
                        else if (cell.display === 'faint' && hasVisibleNeighbour(cell)) {
                            // Go from faint to question or visible
                            cell.display = (cell.char === ' ' || cell.char === '0') ? 'visible' : 'unknown';
                            cell.element.classList.remove(ClassNames.Faint);
                        }
                        // Update the appearance of the cells
                        if (cell.display === 'hidden') {
                            // Hidden cells display as empty.
                            cell.element.innerHTML = ' ';
                        }
                        else if (cell.display === 'faint') {
                            // Unknown cells display as '?'
                            cell.element.innerHTML = '?';
                        }
                        else if (cell.display === 'unknown') {
                            // Unknown cells display as '?'
                            cell.element.innerHTML = '?';
                            cell.interactive = true;
                        }
                        else {
                            // Revealed cells display as normal.
                            cell.refresh();
                        }
                    }
                }
                catch (e_6_1) { e_6 = { error: e_6_1 }; }
                finally {
                    try {
                        if (row_1_1 && !row_1_1.done && (_b = row_1.return)) _b.call(row_1);
                    }
                    finally { if (e_6) throw e_6.error; }
                }
            }
        }
        catch (e_5_1) { e_5 = { error: e_5_1 }; }
        finally {
            try {
                if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
            }
            finally { if (e_5) throw e_5.error; }
        }
    };
    GameOld.prototype.refreshBeacons = function () {
        var e_7, _a, e_8, _b, e_9, _c, e_10, _d, e_11, _e;
        // Zero group (anti-beacons) overrides all. Makes all beacons highlight.
        if (this.beacons[0].some(function (c) { return c.isBeaconActive; })) {
            try {
                for (var _f = __values(this.beacons), _g = _f.next(); !_g.done; _g = _f.next()) {
                    var group = _g.value;
                    try {
                        for (var group_1 = (e_8 = void 0, __values(group)), group_1_1 = group_1.next(); !group_1_1.done; group_1_1 = group_1.next()) {
                            var cell = group_1_1.value;
                            if (cell.display === 'visible' && cell.isBeacon) {
                                cell.beaconType = 'disabled';
                            }
                        }
                    }
                    catch (e_8_1) { e_8 = { error: e_8_1 }; }
                    finally {
                        try {
                            if (group_1_1 && !group_1_1.done && (_b = group_1.return)) _b.call(group_1);
                        }
                        finally { if (e_8) throw e_8.error; }
                    }
                }
            }
            catch (e_7_1) { e_7 = { error: e_7_1 }; }
            finally {
                try {
                    if (_g && !_g.done && (_a = _f.return)) _a.call(_f);
                }
                finally { if (e_7) throw e_7.error; }
            }
            return;
        }
        else {
            try {
                // Deactiate the zero beacons
                for (var _h = __values(this.beacons[0]), _j = _h.next(); !_j.done; _j = _h.next()) {
                    var cell = _j.value;
                    cell.element.classList.remove(ClassNames.BeaconDisabled);
                }
            }
            catch (e_9_1) { e_9 = { error: e_9_1 }; }
            finally {
                try {
                    if (_j && !_j.done && (_c = _h.return)) _c.call(_h);
                }
                finally { if (e_9) throw e_9.error; }
            }
        }
        for (var i = 1; i < 7; i++) {
            var group = this.beacons[i];
            // If entire group active, highlight them all and make active.
            if (!group.some(function (c) { return !c.isBeaconActive; })) {
                try {
                    for (var group_2 = (e_10 = void 0, __values(group)), group_2_1 = group_2.next(); !group_2_1.done; group_2_1 = group_2.next()) {
                        var cell = group_2_1.value;
                        if (cell.display === 'visible') {
                            cell.interactive = true;
                            cell.beaconType = 'level-finished';
                        }
                    }
                }
                catch (e_10_1) { e_10 = { error: e_10_1 }; }
                finally {
                    try {
                        if (group_2_1 && !group_2_1.done && (_d = group_2.return)) _d.call(group_2);
                    }
                    finally { if (e_10) throw e_10.error; }
                }
                continue;
            }
            try {
                // Otherwise highlight them depending on whether they are active
                for (var group_3 = (e_11 = void 0, __values(group)), group_3_1 = group_3.next(); !group_3_1.done; group_3_1 = group_3.next()) {
                    var cell = group_3_1.value;
                    // Also need to check that the beacon is still there...
                    if (cell.display === 'visible' && cell.char === String(i)) {
                        if (hasVisibleNeighbour(cell)) {
                            cell.beaconType = 'active';
                        }
                        else {
                            cell.beaconType = 'inactive';
                        }
                    }
                    else {
                        // Invisible or deactivated beacon cell
                        cell.beaconType = 'none';
                    }
                }
            }
            catch (e_11_1) { e_11 = { error: e_11_1 }; }
            finally {
                try {
                    if (group_3_1 && !group_3_1.done && (_e = group_3.return)) _e.call(group_3);
                }
                finally { if (e_11) throw e_11.error; }
            }
        }
    };
    GameOld.prototype.refresh = function () {
        this.refreshCells();
        this.refreshBeacons();
    };
    Object.defineProperty(GameOld.prototype, "slider", {
        get: function () { return this._slider; },
        set: function (newCell) {
            // Updates styles on the old cell
            this._slider.element.classList.remove(ClassNames.Slider);
            this._slider.char = ' ';
            // Clear the directions
            var _a = getNeighbours(this._slider), left = _a.left, right = _a.right, up = _a.up, down = _a.down;
            if (up && up.char === 'N') {
                up.char = ' ';
            }
            if (down && down.char === 'S') {
                down.char = ' ';
            }
            if (right && right.char === 'E') {
                right.char = ' ';
            }
            if (left && left.char === 'W') {
                left.char = ' ';
            }
            newCell.element.classList.add(ClassNames.Slider);
            newCell.char = '@';
            this._slider = newCell;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GameOld.prototype, "powerLevel", {
        get: function () { return this._powerLevel; },
        set: function (newValue) {
            if (newValue < 0 || newValue > 6) {
                console.log('invalid power level');
                return;
            }
            // Extra code to make the powers container appear
            if (elements['powers-container'].classList.contains(ClassNames.Invisible)) {
                elements['powers-container'].classList.remove(ClassNames.Invisible);
                elements['powers-container'].scrollIntoView({ behavior: 'smooth' });
            }
            this._powerLevel = newValue;
            // Make parts of the container appear
            for (var p = 1; p <= newValue; p++) {
                var li = elements['power-containers'][p - 1];
                li.classList.remove(ClassNames.Invisible);
            }
            checkCompletion();
        },
        enumerable: true,
        configurable: true
    });
    GameOld.RowCount = ui_1.MAP_SCHEMATIC.length;
    GameOld.ColumnCount = ui_1.MAP_SCHEMATIC[0].length;
    return GameOld;
}());
var go = new GameOld();
var currencyCollected = 0;
/** Index of next trophy. */
var nextTrophy = 0;
var MAX_CURRENCY = 1000;
var isGameInteractable = false;
/**
 * Returns whether or not at least one of the 4 neighbours
 * is visible and non-empty.
 *
 * @param dist distance from middle
 */
function hasVisibleNeighbour(cell, dist) {
    var e_12, _a;
    if (dist === void 0) { dist = 1; }
    var neighbours = getNeighboursAsArray(cell, dist);
    try {
        for (var neighbours_1 = __values(neighbours), neighbours_1_1 = neighbours_1.next(); !neighbours_1_1.done; neighbours_1_1 = neighbours_1.next()) {
            var n = neighbours_1_1.value;
            if (n.display === 'visible' && !n.isClear) {
                return true;
            }
        }
    }
    catch (e_12_1) { e_12 = { error: e_12_1 }; }
    finally {
        try {
            if (neighbours_1_1 && !neighbours_1_1.done && (_a = neighbours_1.return)) _a.call(neighbours_1);
        }
        finally { if (e_12) throw e_12.error; }
    }
    return false;
}
/**
 * Handler for when a span is clicked.
 *
 * @param r row index
 * @param c col index
 */
function onSpanClick(row, col) {
    var cell = go.cells[row][col];
    if (cell.display === 'unknown') { // May click '?' to reveal it
        cell.display = 'visible';
        go.refresh();
        return;
    }
    if (!isInteractive(cell)) {
        return;
    }
    // Initial words disappear when clicked.
    // Hacky optimisation: short-circuit if power level indicates progress beyond.
    if (go.powerLevel < 1 && cell.isInitialSentence) {
        // To be less tedious, also removes contiguous lowercase characters.
        cell.char = ' ';
        var r = cell.row;
        var c = 0;
        // Go left
        c = cell.column - 1;
        while (c >= 0) {
            var currentCell = go.cells[r][c];
            if (!(currentCell.isInitialSentence)) {
                break;
            }
            currentCell.char = ' ';
            c--;
        }
        // Go right
        c = cell.column + 1;
        while (c < GameOld.ColumnCount) {
            var currentCell = go.cells[r][c];
            if (!(currentCell.isInitialSentence)) {
                break;
            }
            currentCell.char = ' ';
            c++;
        }
        return go.refresh();
    }
    if (cell.char === '.') {
        var r = cell.row;
        var c = 0;
        if (elements['power-3-checkbox'].checked) {
            c = cell.column;
            while (c >= 0) {
                // If the cell on the left is not '.' (including out of bounds), may retract
                if (c - 1 < 0 || go.cells[r][c - 1].char !== '.') {
                    go.cells[r][c].char = ' ';
                    return go.refresh();
                }
                c--;
            }
        }
        // May expand to the left as long as there is space at the end of the ...
        c = cell.column - 1;
        while (c >= 0) {
            if (go.cells[r][c].isClear) {
                go.cells[r][c].char = '.';
                return go.refresh();
            }
            if (go.cells[r][c].char !== '.') {
                break;
            }
            c--;
        }
    }
    if (cell.char === '+') {
        // May expand out as long as there is empty space at the end of any pipe.
        var r = 0;
        var c = 0;
        // Go left
        r = cell.row;
        c = cell.column - 1;
        while (c >= 0) {
            if (go.cells[r][c].isClear) {
                go.cells[r][c].char = '-';
                break;
            }
            if (go.cells[r][c].char !== '-') {
                break;
            }
            c--;
        }
        // Go right
        c = cell.column + 1;
        while (c < GameOld.ColumnCount) {
            if (go.cells[r][c].isClear) {
                go.cells[r][c].char = '-';
                break;
            }
            if (go.cells[r][c].char !== '-') {
                break;
            }
            c++;
        }
        // Go up
        r = cell.row - 1;
        c = cell.column;
        while (r >= 0) {
            if (go.cells[r][c].isClear) {
                go.cells[r][c].char = '|';
                break;
            }
            if (go.cells[r][c].char !== '|') {
                break;
            }
            r--;
        }
        // Go down
        r = cell.row + 1;
        while (r < GameOld.RowCount) {
            if (go.cells[r][c].isClear) {
                go.cells[r][c].char = '|';
                break;
            }
            if (go.cells[r][c].char !== '|') {
                break;
            }
            r++;
        }
        return go.refresh();
    }
    // If click on beacon, check if the others are all active...
    if (cell.isBeacon) {
        if (cell.beaconType == 'level-finished') {
            var numBeaconsActive = parseInt(cell.char, 10);
            go.powerLevel = numBeaconsActive;
            destroyAndRevealBeacons(numBeaconsActive);
        }
        return go.refresh();
    }
    // Currency gets replaced with wall when collected.
    if (cell.char === '$') {
        addCurrency();
        cell.char = '#';
        return go.refresh();
    }
    if (cell.char === 'N') {
        // Move slider up until it hits something or runs out of space
        var r = go.slider.row - 1;
        var c = go.slider.column;
        while (r >= 0 && go.cells[r][c].isClear) {
            r--;
        }
        go.slider = go.cells[r + 1][c];
        return go.refresh();
    }
    if (cell.char === 'S') {
        // Move slider down until it hits something or runs out of space
        var r = go.slider.row + 1;
        var c = go.slider.column;
        while (r < GameOld.RowCount && go.cells[r][c].isClear) {
            r++;
        }
        go.slider = go.cells[r - 1][c];
        return go.refresh();
    }
    if (cell.char === 'E') {
        // Move slider left until it hits something or runs out of space
        var r = go.slider.row;
        var c = go.slider.column + 1;
        while (c < GameOld.ColumnCount && go.cells[r][c].isClear) {
            c++;
        }
        go.slider = go.cells[r][c - 1];
        return go.refresh();
    }
    if (cell.char === 'W') {
        // Move slider right until it hits something or runs out of space
        var r = go.slider.row;
        var c = go.slider.column - 1;
        while (c >= 0 && go.cells[r][c].isClear) {
            c--;
        }
        go.slider = go.cells[r][c + 1];
        return go.refresh();
    }
}
/** Checks if a char is interactive -- i.e. satisfies the conditions for interaction. */
function isInteractive(cell) {
    if (!isGameInteractable) {
        return false;
    }
    // The slider's directions are interactive. (The slider itself isn't)
    if (cell.char.match(/[NSEW]/)) {
        return true;
    }
    // Other hidden and empty cells are not interactive.
    if (cell.char === ' ' || cell.display === 'hidden' || cell.display === 'faint') {
        return false;
    }
    if (go.powerLevel < 1 && cell.isInitialSentence) {
        return true; // Matches the initial sentence.
    }
    // May expand to the left as long as there is space at the end of the line...
    if (cell.char === '.') {
        // May expand as long as there is empty space at the end of any pipe.
        var r = cell.row;
        var c = cell.column;
        if (elements['power-3-checkbox'].checked) {
            //  May retract as long as there is a dot on the left.
            return isInMapBounds(r, c - 1) && (go.cells[r][c - 1].char === '.');
        }
        // Go left
        r = cell.row;
        c = cell.column - 1;
        while (c >= 0) {
            if (go.cells[r][c].isClear) {
                return true;
            }
            if (go.cells[r][c].char !== '.') {
                break;
            }
            c--;
        }
    }
    if (cell.display === 'unknown') {
        return true;
    }
    if (cell.char === '$') {
        return true;
    }
    if (cell.char === '+') {
        // May expand as long as there is empty space at the end of any pipe.
        var r = 0;
        var c = 0;
        // Go left
        r = cell.row;
        c = cell.column - 1;
        while (c >= 0) {
            if (go.cells[r][c].isClear) {
                return true;
            }
            if (go.cells[r][c].char !== '-') {
                break;
            }
            c--;
        }
        // Go right
        c = cell.column + 1;
        while (c < GameOld.ColumnCount) {
            if (go.cells[r][c].isClear) {
                return true;
            }
            if (go.cells[r][c].char !== '-') {
                break;
            }
            c++;
        }
        // Go up
        r = cell.row - 1;
        c = cell.column;
        while (r >= 0) {
            if (go.cells[r][c].isClear) {
                return true;
            }
            if (go.cells[r][c].char !== '|') {
                break;
            }
            r--;
        }
        // Go down
        r = cell.row + 1;
        while (r < GameOld.RowCount) {
            if (go.cells[r][c].isClear) {
                return true;
            }
            if (go.cells[r][c].char !== '|') {
                break;
            }
            r++;
        }
        return false;
    }
    if (cell.isBeacon) {
        // See logic in: updateBeacons
        return cell.beaconType == 'level-finished';
    }
    return false;
}
/** Whether or not the coordinate is in bounds */
function isInMapBounds(r, c) {
    if (r < 0 || r >= GameOld.RowCount || c < 0 || c >= GameOld.ColumnCount) {
        return false;
    }
    return true;
}
/** Get the neighbours of a game.cells cell as an object. 4 of them, maybe null. */
function getNeighbours(cell) {
    var left = isInMapBounds(cell.row, cell.column - 1) ? go.cells[cell.row][cell.column - 1] : null;
    var right = isInMapBounds(cell.row, cell.column + 1) ? go.cells[cell.row][cell.column + 1] : null;
    var down = isInMapBounds(cell.row + 1, cell.column) ? go.cells[cell.row + 1][cell.column] : null;
    var up = isInMapBounds(cell.row - 1, cell.column) ? go.cells[cell.row - 1][cell.column] : null;
    return {
        left: left, right: right, up: up, down: down,
    };
}
/**
 * Get an array the neighbours of a game.cells cell. Up to four of them.
 *
 * @param cell middle cell to get the neighbours of
 * @param dist distance from the middle cell (default 1)
 */
function getNeighboursAsArray(cell, dist) {
    if (dist === void 0) { dist = 1; }
    var left = isInMapBounds(cell.row, cell.column - dist) ? go.cells[cell.row][cell.column - dist] : null;
    var right = isInMapBounds(cell.row, cell.column + dist) ? go.cells[cell.row][cell.column + dist] : null;
    var down = isInMapBounds(cell.row + dist, cell.column) ? go.cells[cell.row + dist][cell.column] : null;
    var up = isInMapBounds(cell.row - dist, cell.column) ? go.cells[cell.row - dist][cell.column] : null;
    var arr = [];
    if (left) {
        arr.push(left);
    }
    if (right) {
        arr.push(right);
    }
    if (up) {
        arr.push(up);
    }
    if (down) {
        arr.push(down);
    }
    return arr;
}
/**
 * Deactivate all the beacons on the game.cells with number equal to beaconNum.
 * And reveal all the beacons on the game.cells with number equal to beaconNum + 1.
 */
function destroyAndRevealBeacons(beaconNum) {
    var e_13, _a, e_14, _b;
    var toDestroy = String(beaconNum);
    var toReveal = String(beaconNum + 1);
    try {
        for (var _c = __values(go.cells), _d = _c.next(); !_d.done; _d = _c.next()) {
            var row = _d.value;
            try {
                for (var row_2 = (e_14 = void 0, __values(row)), row_2_1 = row_2.next(); !row_2_1.done; row_2_1 = row_2.next()) {
                    var cell = row_2_1.value;
                    if (cell.char === toReveal) {
                        cell.display = 'visible';
                        cell.element.classList.remove(ClassNames.Faint);
                    }
                    else if (cell.char === toDestroy) {
                        cell.char = ' ';
                    }
                }
            }
            catch (e_14_1) { e_14 = { error: e_14_1 }; }
            finally {
                try {
                    if (row_2_1 && !row_2_1.done && (_b = row_2.return)) _b.call(row_2);
                }
                finally { if (e_14) throw e_14.error; }
            }
        }
    }
    catch (e_13_1) { e_13 = { error: e_13_1 }; }
    finally {
        try {
            if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
        }
        finally { if (e_13) throw e_13.error; }
    }
}
/** Power: remove all pipes from the game.cells */
function removeAllPipes() {
    var e_15, _a, e_16, _b;
    if (go.powerLevel < 1) {
        console.error('Must have power level at least 1');
        return;
    }
    try {
        for (var _c = __values(go.cells), _d = _c.next(); !_d.done; _d = _c.next()) {
            var row = _d.value;
            try {
                for (var row_3 = (e_16 = void 0, __values(row)), row_3_1 = row_3.next(); !row_3_1.done; row_3_1 = row_3.next()) {
                    var cell = row_3_1.value;
                    if (cell.char === '-' || cell.char === '|') {
                        cell.char = ' ';
                    }
                }
            }
            catch (e_16_1) { e_16 = { error: e_16_1 }; }
            finally {
                try {
                    if (row_3_1 && !row_3_1.done && (_b = row_3.return)) _b.call(row_3);
                }
                finally { if (e_16) throw e_16.error; }
            }
        }
    }
    catch (e_15_1) { e_15 = { error: e_15_1 }; }
    finally {
        try {
            if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
        }
        finally { if (e_15) throw e_15.error; }
    }
    go.refresh();
}
/** Add 1 to currency. Updates the trophies. */
function addCurrency() {
    elements['trophy-container'].classList.remove(ClassNames.Invisible);
    currencyCollected += 100;
    elements['trophy-money'].textContent = "Money: $" + currencyCollected;
    if (ui_1.TROPHIES[nextTrophy].cost <= currencyCollected) {
        // Can display the next trophy
        elements['trophy-case'].appendChild(trophyToHtml(ui_1.TROPHIES[nextTrophy].design));
        elements['trophy-case'].scrollIntoView({ behavior: 'smooth' });
        nextTrophy++;
        elements['trophy-next'].innerHTML = nextTrophy < ui_1.TROPHIES.length
            ? "\n\n\n Next: $" + ui_1.TROPHIES[nextTrophy].cost + " \n\n\n" : "\n\n\n FOUND \n THEM \n ALL! \n\n\n";
    }
    checkCompletion();
}
function trophyToHtml(design) {
    var pre = document.createElement('pre');
    pre.innerHTML = design.join('\n');
    pre.classList.add('trophy');
    return pre;
}
/** Check completionist: have max power level and all trophies */
function checkCompletion() {
    if (go.powerLevel === 6
        && currencyCollected === MAX_CURRENCY) {
        var p = document.getElementById('completionist');
        if (p.textContent.length > 0) {
            return;
        }
        p.textContent = '100% Completion! You win! Thanks for playing.';
        p.scrollIntoView({ behavior: 'smooth' });
    }
}
go.refresh();
elements['main-container'].style.opacity = '0';
go.refresh();
// Page starts blank
var pageOpacityMultipler = 0;
/** Master switch to control if the pre can be interacted with. */
function setGameInteractable(value) {
    isGameInteractable = value;
}
function handleClick() {
    // Increase opacity until 1, then remove the event
    pageOpacityMultipler += 1;
    if (pageOpacityMultipler < 10) {
        // Not using floats here due to floating point imprecision
        elements['main-container'].style.opacity = "." + pageOpacityMultipler;
    }
    else {
        elements['main-container'].style.opacity = '1';
        document.removeEventListener('click', handleClick);
        setGameInteractable(true);
        go.refresh();
    }
}
document.addEventListener('click', handleClick);
elements['power-2-button'].addEventListener('click', function () {
    removeAllPipes();
});
elements['power-3-checkbox'].addEventListener('change', function () {
    go.refresh();
});


/***/ }),

/***/ "./src/ui.ts":
/*!*******************!*\
  !*** ./src/ui.ts ***!
  \*******************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var e_1, _a;
Object.defineProperty(exports, "__esModule", { value: true });
/** The world map. Everything starts hidden except for the first sentence. */
exports.MAP_SCHEMATIC = [
    '@           0 4                              #  $ + 5 ',
    '          4    #             0          .     ## #   #',
    '               +              +          6 $ #      # ',
    '                                          0  #        ',
    '# + This page is intentionally left blank.            ',
    '                                              #       ',
    '4          +                 +            +    5      ',
    '               # #          ##                        ',
    '# +     1     +   #            0             # #      ',
    '                           #+                 #       ',
    '3      2     .                                       #',
    '            #     +   #                           #   ',
    '  #     # 4    +    #  #    5                         ',
    '            0 #    2                      $ #        #',
    '          #      +      # # 6 ### #$## ##        # # #',
    '     # $ #        #   3  # # #   0    #  # $ ####   6 ',
    '           #     # # #  #   #                     $   ',
    '       #        3 $ $ ##     +        #    +          ',
    ' #             # #   0   +     #                    6 ',
    '5 #####  # #### #                +    6   #           ',
    '           #         +       0                  ## $  ',
    '# 6     +   5 0 #     #    #           #              ',
];
if (exports.MAP_SCHEMATIC.reduce(function (sum, row) { return sum + Array.from(row).filter(function (c) { return c == '$'; }).length; }, 0) != 10) {
    console.log('incorrect number of money');
}
// Need to escape the backslashes though
exports.TROPHIES = [{
        design: [
            '     ',
            '     ',
            '     ',
            '     ',
            '     ',
            '  _  ',
            ' {1} ',
            '  "  ',
        ],
        cost: 100,
    }, {
        design: [
            '     ',
            '     ',
            '     ',
            '     ',
            '  _  ',
            ' /=\\ ',
            ' \\"/ ',
            ' /_\\ ',
        ],
        cost: 200,
    }, {
        design: [
            '       ',
            '       ',
            '       ',
            '  /-\\  ',
            ' [\\_/] ',
            '  \\ /  ',
            '  |4|  ',
            '  [_]  ',
        ],
        cost: 400,
    }, {
        design: [
            '          ',
            '          ',
            '   ____   ',
            ' /| .. |\\ ',
            ' \\| .. |/ ',
            '  \\    /  ',
            '   |__|   ',
            '  /____\\  ',
        ],
        cost: 600,
    }, {
        design: [
            '     __     ',
            '   /`  \\\\   ',
            '  _\\___//_  ',
            ' | | LD | | ',
            '  \\| 45 |/  ',
            '   \\    /   ',
            '    |__|    ',
            '   /____\\   ',
        ],
        cost: 800,
    }, {
        design: [
            '   /````\\   ',
            '  /  /\\  \\  ',
            '  \\  \\/  /  ',
            '   \\  \\ /   ',
            ' \\-/\\  \\\\-/ ',
            ' /-\\ __ /-\\ ',
            '    |__|    ',
            '   /____\\   ',
        ],
        cost: 1000,
    }];
try {
    // Trophies must have correct height
    for (var TROPHIES_1 = __values(exports.TROPHIES), TROPHIES_1_1 = TROPHIES_1.next(); !TROPHIES_1_1.done; TROPHIES_1_1 = TROPHIES_1.next()) {
        var t = TROPHIES_1_1.value;
        if (t.design.length !== 8) {
            console.error('T has incorrect height', t);
        }
    }
}
catch (e_1_1) { e_1 = { error: e_1_1 }; }
finally {
    try {
        if (TROPHIES_1_1 && !TROPHIES_1_1.done && (_a = TROPHIES_1.return)) _a.call(TROPHIES_1);
    }
    finally { if (e_1) throw e_1.error; }
}


/***/ }),

/***/ "./src/util.ts":
/*!*********************!*\
  !*** ./src/util.ts ***!
  \*********************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
function range(start, stop, step) {
    if (typeof stop == 'undefined') {
        // one param defined
        stop = start;
        start = 0;
    }
    if (typeof step == 'undefined') {
        step = 1;
    }
    if ((step > 0 && start >= stop) || (step < 0 && start <= stop)) {
        return [];
    }
    var result = [];
    for (var i = start; step > 0 ? i < stop : i > stop; i += step) {
        result.push(i);
    }
    return result;
}
exports.range = range;
;


/***/ })

/******/ });
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly8vd2VicGFjay9ib290c3RyYXAiLCJ3ZWJwYWNrOi8vLy4vc3JjL2NvbnRlbnQudHMiLCJ3ZWJwYWNrOi8vLy4vc3JjL2dhbWUudHMiLCJ3ZWJwYWNrOi8vLy4vc3JjL2luZGV4LnRzIiwid2VicGFjazovLy8uL3NyYy91aS50cyIsIndlYnBhY2s6Ly8vLi9zcmMvdXRpbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO1FBQUE7UUFDQTs7UUFFQTtRQUNBOztRQUVBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBOztRQUVBO1FBQ0E7O1FBRUE7UUFDQTs7UUFFQTtRQUNBO1FBQ0E7OztRQUdBO1FBQ0E7O1FBRUE7UUFDQTs7UUFFQTtRQUNBO1FBQ0E7UUFDQSwwQ0FBMEMsZ0NBQWdDO1FBQzFFO1FBQ0E7O1FBRUE7UUFDQTtRQUNBO1FBQ0Esd0RBQXdELGtCQUFrQjtRQUMxRTtRQUNBLGlEQUFpRCxjQUFjO1FBQy9EOztRQUVBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQTtRQUNBO1FBQ0E7UUFDQSx5Q0FBeUMsaUNBQWlDO1FBQzFFLGdIQUFnSCxtQkFBbUIsRUFBRTtRQUNySTtRQUNBOztRQUVBO1FBQ0E7UUFDQTtRQUNBLDJCQUEyQiwwQkFBMEIsRUFBRTtRQUN2RCxpQ0FBaUMsZUFBZTtRQUNoRDtRQUNBO1FBQ0E7O1FBRUE7UUFDQSxzREFBc0QsK0RBQStEOztRQUVySDtRQUNBOzs7UUFHQTtRQUNBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDaEZBLElBQU0sT0FBTyxHQUFHO0lBQ1osd0RBQXdEO0lBQ3hELHdEQUF3RDtJQUN4RCx3REFBd0Q7SUFDeEQsd0RBQXdEO0lBQ3hELHdEQUF3RDtJQUN4RCx3REFBd0Q7SUFDeEQsd0RBQXdEO0lBQ3hELHdEQUF3RDtJQUN4RCx3REFBd0Q7SUFDeEQsd0RBQXdEO0lBQ3hELHdEQUF3RDtJQUN4RCx3REFBd0Q7SUFDeEQsd0RBQXdE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Ozs7Ozs7Ozs7Ozs7OztBQzdHRCxTQUFnQixLQUFLLENBQUMsS0FBYSxFQUFFLElBQWEsRUFBRSxJQUFhO0lBQzdELElBQUksT0FBTyxJQUFJLElBQUksV0FBVyxFQUFFO1FBQzVCLG9CQUFvQjtRQUNwQixJQUFJLEdBQUcsS0FBSyxDQUFDO1FBQ2IsS0FBSyxHQUFHLENBQUMsQ0FBQztLQUNiO0lBQ0QsSUFBSSxPQUFPLElBQUksSUFBSSxXQUFXLEVBQUU7UUFDNUIsSUFBSSxHQUFHLENBQUMsQ0FBQztLQUNaO0lBQ0QsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUMsSUFBSSxLQUFLLElBQUksSUFBSSxDQUFDLEVBQUU7UUFDNUQsT0FBTyxFQUFFLENBQUM7S0FDYjtJQUVELElBQU0sTUFBTSxHQUFHLEVBQUUsQ0FBQztJQUNsQixLQUFLLElBQUksQ0FBQyxHQUFHLEtBQUssRUFBRSxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsSUFBSSxJQUFJLEVBQUU7UUFDM0QsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUNsQjtJQUNELE9BQU8sTUFBTSxDQUFDO0FBQ2xCLENBQUM7QUFsQkQsc0JBa0JDO0FBQUEsQ0FBQyIsImZpbGUiOiJpbmRleC5qcyIsInNvdXJjZXNDb250ZW50IjpbIiBcdC8vIFRoZSBtb2R1bGUgY2FjaGVcbiBcdHZhciBpbnN0YWxsZWRNb2R1bGVzID0ge307XG5cbiBcdC8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG4gXHRmdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cbiBcdFx0Ly8gQ2hlY2sgaWYgbW9kdWxlIGlzIGluIGNhY2hlXG4gXHRcdGlmKGluc3RhbGxlZE1vZHVsZXNbbW9kdWxlSWRdKSB7XG4gXHRcdFx0cmV0dXJuIGluc3RhbGxlZE1vZHVsZXNbbW9kdWxlSWRdLmV4cG9ydHM7XG4gXHRcdH1cbiBcdFx0Ly8gQ3JlYXRlIGEgbmV3IG1vZHVsZSAoYW5kIHB1dCBpdCBpbnRvIHRoZSBjYWNoZSlcbiBcdFx0dmFyIG1vZHVsZSA9IGluc3RhbGxlZE1vZHVsZXNbbW9kdWxlSWRdID0ge1xuIFx0XHRcdGk6IG1vZHVsZUlkLFxuIFx0XHRcdGw6IGZhbHNlLFxuIFx0XHRcdGV4cG9ydHM6IHt9XG4gXHRcdH07XG5cbiBcdFx0Ly8gRXhlY3V0ZSB0aGUgbW9kdWxlIGZ1bmN0aW9uXG4gXHRcdG1vZHVsZXNbbW9kdWxlSWRdLmNhbGwobW9kdWxlLmV4cG9ydHMsIG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMsIF9fd2VicGFja19yZXF1aXJlX18pO1xuXG4gXHRcdC8vIEZsYWcgdGhlIG1vZHVsZSBhcyBsb2FkZWRcbiBcdFx0bW9kdWxlLmwgPSB0cnVlO1xuXG4gXHRcdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG4gXHRcdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbiBcdH1cblxuXG4gXHQvLyBleHBvc2UgdGhlIG1vZHVsZXMgb2JqZWN0IChfX3dlYnBhY2tfbW9kdWxlc19fKVxuIFx0X193ZWJwYWNrX3JlcXVpcmVfXy5tID0gbW9kdWxlcztcblxuIFx0Ly8gZXhwb3NlIHRoZSBtb2R1bGUgY2FjaGVcbiBcdF9fd2VicGFja19yZXF1aXJlX18uYyA9IGluc3RhbGxlZE1vZHVsZXM7XG5cbiBcdC8vIGRlZmluZSBnZXR0ZXIgZnVuY3Rpb24gZm9yIGhhcm1vbnkgZXhwb3J0c1xuIFx0X193ZWJwYWNrX3JlcXVpcmVfXy5kID0gZnVuY3Rpb24oZXhwb3J0cywgbmFtZSwgZ2V0dGVyKSB7XG4gXHRcdGlmKCFfX3dlYnBhY2tfcmVxdWlyZV9fLm8oZXhwb3J0cywgbmFtZSkpIHtcbiBcdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgbmFtZSwgeyBlbnVtZXJhYmxlOiB0cnVlLCBnZXQ6IGdldHRlciB9KTtcbiBcdFx0fVxuIFx0fTtcblxuIFx0Ly8gZGVmaW5lIF9fZXNNb2R1bGUgb24gZXhwb3J0c1xuIFx0X193ZWJwYWNrX3JlcXVpcmVfXy5yID0gZnVuY3Rpb24oZXhwb3J0cykge1xuIFx0XHRpZih0eXBlb2YgU3ltYm9sICE9PSAndW5kZWZpbmVkJyAmJiBTeW1ib2wudG9TdHJpbmdUYWcpIHtcbiBcdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgU3ltYm9sLnRvU3RyaW5nVGFnLCB7IHZhbHVlOiAnTW9kdWxlJyB9KTtcbiBcdFx0fVxuIFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgJ19fZXNNb2R1bGUnLCB7IHZhbHVlOiB0cnVlIH0pO1xuIFx0fTtcblxuIFx0Ly8gY3JlYXRlIGEgZmFrZSBuYW1lc3BhY2Ugb2JqZWN0XG4gXHQvLyBtb2RlICYgMTogdmFsdWUgaXMgYSBtb2R1bGUgaWQsIHJlcXVpcmUgaXRcbiBcdC8vIG1vZGUgJiAyOiBtZXJnZSBhbGwgcHJvcGVydGllcyBvZiB2YWx1ZSBpbnRvIHRoZSBuc1xuIFx0Ly8gbW9kZSAmIDQ6IHJldHVybiB2YWx1ZSB3aGVuIGFscmVhZHkgbnMgb2JqZWN0XG4gXHQvLyBtb2RlICYgOHwxOiBiZWhhdmUgbGlrZSByZXF1aXJlXG4gXHRfX3dlYnBhY2tfcmVxdWlyZV9fLnQgPSBmdW5jdGlvbih2YWx1ZSwgbW9kZSkge1xuIFx0XHRpZihtb2RlICYgMSkgdmFsdWUgPSBfX3dlYnBhY2tfcmVxdWlyZV9fKHZhbHVlKTtcbiBcdFx0aWYobW9kZSAmIDgpIHJldHVybiB2YWx1ZTtcbiBcdFx0aWYoKG1vZGUgJiA0KSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICYmIHZhbHVlLl9fZXNNb2R1bGUpIHJldHVybiB2YWx1ZTtcbiBcdFx0dmFyIG5zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiBcdFx0X193ZWJwYWNrX3JlcXVpcmVfXy5yKG5zKTtcbiBcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG5zLCAnZGVmYXVsdCcsIHsgZW51bWVyYWJsZTogdHJ1ZSwgdmFsdWU6IHZhbHVlIH0pO1xuIFx0XHRpZihtb2RlICYgMiAmJiB0eXBlb2YgdmFsdWUgIT0gJ3N0cmluZycpIGZvcih2YXIga2V5IGluIHZhbHVlKSBfX3dlYnBhY2tfcmVxdWlyZV9fLmQobnMsIGtleSwgZnVuY3Rpb24oa2V5KSB7IHJldHVybiB2YWx1ZVtrZXldOyB9LmJpbmQobnVsbCwga2V5KSk7XG4gXHRcdHJldHVybiBucztcbiBcdH07XG5cbiBcdC8vIGdldERlZmF1bHRFeHBvcnQgZnVuY3Rpb24gZm9yIGNvbXBhdGliaWxpdHkgd2l0aCBub24taGFybW9ueSBtb2R1bGVzXG4gXHRfX3dlYnBhY2tfcmVxdWlyZV9fLm4gPSBmdW5jdGlvbihtb2R1bGUpIHtcbiBcdFx0dmFyIGdldHRlciA9IG1vZHVsZSAmJiBtb2R1bGUuX19lc01vZHVsZSA/XG4gXHRcdFx0ZnVuY3Rpb24gZ2V0RGVmYXVsdCgpIHsgcmV0dXJuIG1vZHVsZVsnZGVmYXVsdCddOyB9IDpcbiBcdFx0XHRmdW5jdGlvbiBnZXRNb2R1bGVFeHBvcnRzKCkgeyByZXR1cm4gbW9kdWxlOyB9O1xuIFx0XHRfX3dlYnBhY2tfcmVxdWlyZV9fLmQoZ2V0dGVyLCAnYScsIGdldHRlcik7XG4gXHRcdHJldHVybiBnZXR0ZXI7XG4gXHR9O1xuXG4gXHQvLyBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGxcbiBcdF9fd2VicGFja19yZXF1aXJlX18ubyA9IGZ1bmN0aW9uKG9iamVjdCwgcHJvcGVydHkpIHsgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsIHByb3BlcnR5KTsgfTtcblxuIFx0Ly8gX193ZWJwYWNrX3B1YmxpY19wYXRoX19cbiBcdF9fd2VicGFja19yZXF1aXJlX18ucCA9IFwiXCI7XG5cblxuIFx0Ly8gTG9hZCBlbnRyeSBtb2R1bGUgYW5kIHJldHVybiBleHBvcnRzXG4gXHRyZXR1cm4gX193ZWJwYWNrX3JlcXVpcmVfXyhfX3dlYnBhY2tfcmVxdWlyZV9fLnMgPSBcIi4vc3JjL2luZGV4LnRzXCIpO1xuIiwiaW1wb3J0IHsgR2FtZUNvbnRlbnQgfSBmcm9tICcuL2dhbWUnO1xuXG5jb25zdCBtYXBCYXNlID0gW1xuICAgICdAICAgICAgICAgICAwIDQgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjICAkICsgNSAnLCAvLyBPbmx5IHRoZSBzbGlkZXIgc2hvdWxkIGJlIGFibGUgdG8gcmVhY2ggdGhpcyA1XG4gICAgJyAgICAgICAgICA0ICAgICMgICAgICAgICAgICAgMCAgICAgICAgICAuICAgICAjIyAjICAgIycsIC8vIExlZnRtb3N0IG5lZWRzIHRvIGJlIGJsb2NrZWRcbiAgICAnICAgICAgICAgICAgICAgKyAgICAgICAgICAgICAgKyAgICAgICAgICA2ICQgIyAgICAgICMgJywgLy8gTmVlZCAuIGFuZCBzbGlkZXIgdG8gYmxvY2sgbWlkZGxlICsgd2hpbGUgaXQgZXh0ZW5kcyB0byA1LlxuICAgICcgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwICAjICAgICAgICAnLFxuICAgICcjICsgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC4gICAgICAgICAgICAnLCAvLyBOZWVkIHRvIGdldCBzbGlkZXIgdG8gYmVsb3cgdGhlIDAuXG4gICAgJyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjICAgICAgICcsXG4gICAgJzQgICAgICAgICAgKyAgICAgICAgICAgICAgICAgKyAgICAgICAgICAgICsgICAgNSAgICAgICcsIC8vIExlZnRtb3N0ICs6IG5lZWQgdXAgMiwgZG93biAzLiBFeHRlbmQgMyBtb3JlLlxuICAgICcgICAgICAgICAgICAgICAjICMgICAgICAgICAgIyMgICAgICAgICAgICAgICAgICAgICAgICAnLFxuICAgICcjICsgICAgIDEgICAgICsgICAjICAgICAgICAgICAgMCAgICAgICAgICAgICAjICMgICAgICAnLCAvLyAybmQgKzogbXVzdCBleHBhbmQgZXhhY3RseSB0d2ljZSB0byByZWFjaCA0LlxuICAgICcgICAgICAgICAgICAgICAgICAgICAgICAgICAjKyAgICAgICAgICAgICAgICAgIyAgICAgICAnLCAvLyBNaWRkbGUgKyBpcyBtb3JlIGRpc2NvdmVyYWJsZSBkdWUgdG8gI1xuICAgICczICAgICAgMiAgICAgLiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICMnLFxuICAgICcgICAgICAgICAgICAjICAgICArICAgIyAgICAgICAgICAgICAgICAgICAgICAgICAgICMgICAnLFxuICAgICcgICMgICAgICMgNCAgICArICAgICMgICMgICAgNSAgICAgICAgICAgICAgICAgICAgICAgICAnLFxuICAgICcgICAgICAgICAgICAwICMgICAgMiAgICAgICAgICAgICAgICAgICAgICAkICMgICAgICAgICMnLFxuICAgICcgICAgICAgICAgIyAgICAgICsgICAgICAjICMgNiAjIyMgIyQjIyAjIyAgICAgICAgIyAjICMnLFxuICAgICcgICAgICMgJCAjICAgICAgICAjICAgMyAgIyAjICMgICAwICAgICMgICMgJCAjIyMjICAgNiAnLFxuICAgICcgICAgICAgICAgICMgICAgICMgIyAjICAjICAgIyAgICAgICAgICAgICAgICAgICAgICQgICAnLFxuICAgICcgICAgICAgIyAgICAgICAgMyAkICQgIyMgICAgICsgICAgICAgICMgICAgKyAgICAgICAgICAnLFxuICAgICcgIyAgICAgICAgICAgICAjICMgICAwICAgKyAgICAgIyAgICAgICAgICAgICAgICAgICAgNiAnLFxuICAgICc1ICMjIyMjICAjICMjIyMgIyAgICAgICAgICAgICAgICArICAgIDYgICAjICAgICAgICAgICAnLFxuICAgICcgICAgICAgICAgICMgICAgICAgICArICAgICAgIDAgICAgICAgICAgICAgICAgICAjIyAkICAnLCAvLyB0aGVzZSBlbXB0eSBzdHJpbmdzIGFyZSB1c2VkIHRvIGluZGljYXRlIExGXG4gICAgJyMgNiAgICAgKyAgIDUgMCAjICAgICAjICAgICMgICAgICAgICAgICMgICAgICAgICAgICAgICcsIFxuXTtcblxuY29uc3QgbWFwU2l6ZTogW251bWJlciwgbnVtYmVyXSA9IFttYXBCYXNlLmxlbmd0aCwgbWFwQmFzZVswXS5sZW5ndGhdO1xuY29uc3QgdHJvcGh5Q291bnQgPSBtYXBCYXNlLnJlZHVjZSgoc3VtLCByb3cpID0+IHN1bSArIEFycmF5LmZyb20ocm93KS5maWx0ZXIoYyA9PiBjID09ICckJykubGVuZ3RoLCAwKTtcblxuY29uc3QgdHJvcGh5TGV2ZWxDb3VudCA9IDY7XG5jb25zdCB0cm9waHlMZXZlbFJlcXVpcmVtZW50cyA9IFsxLCAyLCA0LCA2LCA4LCAxMF07XG5jb25zdCB0cm9waHlJY29uU2l6ZTogW251bWJlciwgbnVtYmVyXSA9IFs4LCAxMl07XG5jb25zdCB0cm9waHlJY29uQmFzZSA9IFN0cmluZy5yYXdgXG58ICAgICAgICAgICAgfCAgICAgICAgICAgIHwgICAgICAgICAgICB8ICAgICAgICAgICAgfCAgICAgX18gICAgIHwgICAvJycnJ1xcICAgfFxufCAgICAgICAgICAgIHwgICAgICAgICAgICB8ICAgICAgICAgICAgfCAgICAgICAgICAgIHwgICAvJyAgXFxcXCAgIHwgIC8gIC9cXCAgXFwgIHxcbnwgICAgICAgICAgICB8ICAgICAgICAgICAgfCAgICAgICAgICAgIHwgICAgX19fXyAgICB8ICBfXFxfX18vL18gIHwgIFxcICBcXC8gIC8gIHxcbnwgICAgICAgICAgICB8ICAgICAgICAgICAgfCAgICAgLy1cXCAgICB8ICAvfCAuLiB8XFwgIHwgfCB8IExEIHwgfCB8ICAgXFwgIFxcIC8gICB8XG58ICAgICAgICAgICAgfCAgICAgIF8gICAgIHwgICAgW1xcXy9dICAgfCAgXFx8IC4uIHwvICB8ICBcXHwgNDUgfC8gIHwgXFwtL1xcICBcXFxcLS8gfFxufCAgICAgIF8gICAgIHwgICAgIC89XFwgICAgfCAgICAgXFwgLyAgICB8ICAgXFwgICAgLyAgIHwgICBcXCAgICAvICAgfCAvLVxcIF9fIC8tXFwgfFxufCAgICAgezF9ICAgIHwgICAgIFxcXCIvICAgIHwgICAgIHxYfCAgICB8ICAgIHxfX3wgICAgfCAgICB8X198ICAgIHwgICAgfF9ffCAgICB8XG58ICAgICAgXCIgICAgIHwgICAgIC9fXFwgICAgfCAgICAgW19dICAgIHwgICAvX19fX1xcICAgfCAgIC9fX19fXFwgICB8ICAgL19fX19cXCAgIHxcbmA7XG5jb25zdCB0cm9waHlJY29ucyA9IHRyb3BoeUljb25CYXNlLnN1YnN0cmluZygxLCB0cm9waHlJY29uQmFzZS5sZW5ndGggLSAxKTtcblxuLy8gc2FuaXR5IGNoZWNrXG5pZiAobWFwQmFzZS5zb21lKHIgPT4gci5sZW5ndGggIT0gbWFwU2l6ZVsxXSkpIHtcbiAgICBjb25zb2xlLmxvZygnbWFwIGNvbHVtbiBpbmNvcnJlY3QnKTtcbn1cbmlmIChtYXBTaXplWzBdICE9IDIyIHx8IG1hcFNpemVbMV0gIT0gNTQpIHtcbiAgICBjb25zb2xlLmxvZygnbWFwIHNpemUgaW5jb3JyZWN0Jyk7XG59XG5pZiAodHJvcGh5Q291bnQgIT0gMTApIHtcbiAgICBjb25zb2xlLmxvZygnbWFwIHRyb3BoeSBpbmNvcnJlY3QnKTtcbn1cbmlmICh0cm9waHlMZXZlbENvdW50ICE9IHRyb3BoeUxldmVsUmVxdWlyZW1lbnRzLmxlbmd0aCkge1xuICAgIGNvbnNvbGUubG9nKCd0cm9waHkgbGV2ZWwgY291bnQgYW5kIHJlcXVpcmVtZW50cyBsZW5ndGggaW5jb3JyZWN0Jyk7XG59XG5pZiAodHJvcGh5TGV2ZWxSZXF1aXJlbWVudHNbdHJvcGh5TGV2ZWxDb3VudCAtIDFdICE9IHRyb3BoeUNvdW50KSB7XG4gICAgY29uc29sZS5sb2coJ3Ryb3BoeSBsZXZlbCBtYXggcmVxdWlyZW1lbnQgYW5kIHRyb3BoeSBjb3VudCBub3QgY29ycmVjdCcpO1xufVxuXG5leHBvcnQgY29uc3QgY29udGVudDogUmVhZG9ubHk8R2FtZUNvbnRlbnQ+ID0ge1xuICAgIE1hcFNpemU6IG1hcFNpemUsXG4gICAgTWFwOiBtYXBCYXNlLFxuICAgIFRyb3BoeUxldmVsQ291bnQ6IHRyb3BoeUxldmVsQ291bnQsXG4gICAgVHJvcGh5TGV2ZWxSZXF1aXJlbWVudHM6IHRyb3BoeUxldmVsUmVxdWlyZW1lbnRzLFxuICAgIFRyb3BoeUljb25TaXplOiB0cm9waHlJY29uU2l6ZSxcbiAgICBUcm9waHlJY29uczogdHJvcGh5SWNvbnMsXG59O1xuIiwiaW1wb3J0IHsgY29udGVudCB9IGZyb20gJy4vY29udGVudCc7XG5pbXBvcnQgeyByYW5nZSB9IGZyb20gJy4vdXRpbCc7XG5cbnR5cGUgQ2VsbFR5cGUgPSBcbiAgICB8ICd3YWxsJyAvLyBzdG9wcyBkb3QsIHBpcGUgYW5kIHNsaWRlciBcbiAgICB8ICdkb3Qtc291cmNlJyAvLyBnZW5lcmF0ZWQgZG90IGF0IGxlZnQgYW5kIGNhbm5vdCBiZSByZXRyYWN0ZWRcbiAgICB8ICdkb3QnICAvLyBleHBhbmRzIGxlZnQgb25lIGJ5IG9uZSwgdmFsaWQgYmVhY29uIG1hcmtlciwgY2FuIHJldHJhY3Qgb25lIGJ5IG9uZSBhZnRlciBzcGVjaWZpYyBnYW1lIGxldmVsXG4gICAgfCAncGlwZS1zb3VyY2UnIC8vIGdlbmVyYXRlcyBwaXBlcyBpbiBmb3VyIGRpcmVjdGlvbnMgdW50aWwgbWVldHMgd2FsbCwgZG90IG9yIG90aGVyIHBpcGVcbiAgICB8ICdwaXBlJyAvLyBwaXBlLCB2YWxpZCBiZWFjb24gbWFya2VyXG4gICAgfCAnemVybycgLy8gc3BlY2lhbCBiZWFjb24sIG9uY2UgbWFya2VkLCBvdGhlciBiZWFjb24gbWFya3Mgd2lsbCBiZSBmb3JjZSB1bm1hcmtlZCAoZ2FtZSBsZXZlbCBjYW5ub3QgcHJvY2VlZClcbiAgICB8ICdiZWFjb24nICAvLyBtYXJrIG9mIG9uZSBsZXZlbCAoYWxsIHNhbWUgdmFsdWUgYmVhY29ucykgcHJvY2VlZHMgZ2FtZSBsZXZlbFxuICAgIHwgJ3NsaWRlcic7IC8vIHNsaWRlIHVudGlsIHdhbGwsIGRvdCwgcGlwZSBhbmQgcGlwZSBzb3VyY2UsIHZhbGlkIGJlYWNvbiBtYXJrZXJcblxudHlwZSBDZWxsRGlzcGxheSA9XG4gICAgfCAnaW5hY3RpdmUnICAvLyBhIGRpc2FibGVkIHF1ZXN0aW9uIG1hcmsgaXMgZGlzcGxheWVkIG9uY2UgcGVyY2VwdGVkXG4gICAgfCAnYWN0aXZlJyAgICAvLyB0aGUgcXVlc3Rpb24gaXMgZW5hYmxlZCBvbmNlIHRvdWNoZWRcbiAgICB8ICdyZXZlYWxlZCc7IC8vIGFjdHVhbCBjZWxsIHR5cGUgcmV2ZWFsZWRcblxuaW50ZXJmYWNlIENlbGxTdGF0ZSB7XG4gICAgcG9zaXRpb246IFtudW1iZXIsIG51bWJlcl0sIC8vIFtyb3csIGNvbF0gc3RhcnQgZnJvbSAwXG4gICAgdHlwZTogQ2VsbFR5cGUsXG4gICAgZGlzcGxheTogQ2VsbERpc3BsYXksXG4gICAgYmVhY29uVmFsdWU6IG51bWJlciwgLy8gZmluaXNoIG9mIGJlYWNvbiBsZXZlbCBtYXJrcyBnYW1lIGxldmVsXG59XG5cbmludGVyZmFjZSBHYW1lU3RhdGUge1xuICAgIGNlbGxzOiBDZWxsU3RhdGVbXSwgLy8gY2VsbHMgc3BhcnNlIGFycmF5XG4gICAgbGV2ZWw6IG51bWJlciwgLy8gZ2FtZSBsZXZlbCB1bmxvY2tzIHVzZXIgYWJpbGl0eSwgLTE6IGluaXRpYWwgc2VudGVuY2UsIDA6IGVhcmx5IGludGVyYWN0aW9uXG4gICAgaW5pdGlhbEFscGhhOiBudW1iZXIsIC8vIGluaXRpYWwgb3BhY2l0eSBpcyAwIGFuZCBjbGljayB0byBpbmNyZWFzZSB0byAxLCByZXByZXNlbnQgYXMgMCB0byAxMCBpbnRlZ2VyIGJlY2F1c2UgMTAgdGltZXMgb2YgKzAuMSBkb2VzIG5vdCBhZGQgdG8gPT0gMVxuICAgIGRvdE1vZGU6ICdleHBhbmQnIHwgJ3JldHJhY3QnLFxuICAgIHNsaWRlclBvc2l0aW9uOiBbbnVtYmVyLCBudW1iZXJdLFxuICAgIHRyb3BoeTogbnVtYmVyLCAvLyBpdGVtcyBjb2xsZWN0ZWRcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHYW1lUmVuZGVyVGFyZ2V0IHtcbiAgICBtYWluOiBIVE1MQ2FudmFzRWxlbWVudCxcbiAgICB0b3A6IEhUTUxDYW52YXNFbGVtZW50LFxuICAgIHRlc3Q6IEhUTUxDYW52YXNFbGVtZW50LFxufVxuaW50ZXJmYWNlIEdhbWVSZW5kZXJUYXJnZXRTdGF0ZSBleHRlbmRzIEdhbWVSZW5kZXJUYXJnZXQge1xuICAgIG1haW5Db250ZXh0OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG4gICAgdG9wQ29udGV4dDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELFxuICAgIHRlc3RDb250ZXh0OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2FtZUNvbnRlbnQge1xuICAgIE1hcFNpemU6IFtudW1iZXIsIG51bWJlcl0sIC8vIFtoZWlnaHQsIHdpZHRoXVxuICAgIE1hcDogc3RyaW5nW10sIC8vIGdyaWQgb2YgY2hhclxuICAgIFRyb3BoeUxldmVsQ291bnQ6IG51bWJlcixcbiAgICBUcm9waHlMZXZlbFJlcXVpcmVtZW50czogbnVtYmVyW10sIC8vIHJlcXVpcmVtZW50IG9mIHRyb3BoeSBjb3VudCB0byByZWFjaCB0cm9weSBsZXZlbFxuICAgIFRyb3BoeUljb25TaXplOiBbbnVtYmVyLCBudW1iZXJdLCAvLyBbaGVpZ2h0LCB3aWR0aF1cbiAgICBUcm9waHlJY29uczogc3RyaW5nLCAvLyBhbiBBU0NJSSBpbWFnZSBmb3IgbXVsdGlwbGUgaWNvbnNcbn1cblxudHlwZSBTY2hlZHVsZUVudHJ5VHlwZSA9XG4gICAgfCAnaW5pdGlhbC1zZW50ZW5jZSc7XG5cbmludGVyZmFjZSBTY2hlZHVsZUVudHJ5IHtcbiAgICB0eXBlOiBTY2hlZHVsZUVudHJ5VHlwZSxcbiAgICBpbml0aWFsU2VudGVuY2VBbHBoYT86IG51bWJlcixcbn1cblxuZXhwb3J0IGNsYXNzIEdhbWUge1xuICAgIHByaXZhdGUgcmVhZG9ubHkgc3RhdGU6IFJlYWRvbmx5PEdhbWVTdGF0ZT47XG4gICAgcHJpdmF0ZSByZWFkb25seSB0YXJnZXQ6IFJlYWRvbmx5PEdhbWVSZW5kZXJUYXJnZXRTdGF0ZT47XG5cbiAgICBwdWJsaWMgY29uc3RydWN0b3IodGFyZ2V0OiBSZWFkb25seTxHYW1lUmVuZGVyVGFyZ2V0Pikge1xuICAgICAgICB0aGlzLnN0YXRlID0ge1xuICAgICAgICAgICAgY2VsbHM6IFtdLFxuICAgICAgICAgICAgbGV2ZWw6IC0xLFxuICAgICAgICAgICAgaW5pdGlhbEFscGhhOiAwLFxuICAgICAgICAgICAgZG90TW9kZTogJ2V4cGFuZCcsXG4gICAgICAgICAgICBzbGlkZXJQb3NpdGlvbjogWzAsIDBdLFxuICAgICAgICAgICAgdHJvcGh5OiAwLFxuICAgICAgICB9O1xuICAgICAgICB0aGlzLnRhcmdldCA9IHtcbiAgICAgICAgICAgIC4uLnRhcmdldCxcbiAgICAgICAgICAgIG1haW5Db250ZXh0OiB0YXJnZXQubWFpbi5nZXRDb250ZXh0KCcyZCcpLFxuICAgICAgICAgICAgdG9wQ29udGV4dDogdGFyZ2V0LnRvcC5nZXRDb250ZXh0KCcyZCcpLFxuICAgICAgICAgICAgdGVzdENvbnRleHQ6IHRhcmdldC50ZXN0LmdldENvbnRleHQoJzJkJyksXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5zY2hlZHVsZSA9IFtdO1xuICAgICAgICB0aGlzLmFuaW1hdGlvbkZyYW1lQ2FsbGJhY2tIYW5kbGVyID0gbnVsbDtcbiAgICB9XG5cbiAgICBwdWJsaWMgaW5pdCgpOiBHYW1lIHtcbiAgICAgICAgZG9jdW1lbnQub25jbGljayA9IHRoaXMuaGFuZGxlQ2xpY2s7XG4gICAgICAgIGZvciAoY29uc3QgY29udGV4dCBvZiBbdGhpcy50YXJnZXQubWFpbkNvbnRleHQsIHRoaXMudGFyZ2V0LnRvcENvbnRleHQsIHRoaXMudGFyZ2V0LnRlc3RDb250ZXh0XSkge1xuICAgICAgICAgICAgY29udGV4dC5mb250ID0gJzEycHggY29uc29sYXMnO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbWV0cmljcyA9IHRoaXMudGFyZ2V0LnRlc3RDb250ZXh0Lm1lYXN1cmVUZXh0KCd8Jyk7XG4gICAgICAgIGNvbnN0IHRleHRIZWlnaHQgPSBtZXRyaWNzLmFjdHVhbEJvdW5kaW5nQm94QXNjZW50ICsgbWV0cmljcy5hY3R1YWxCb3VuZGluZ0JveERlc2NlbnQ7XG5cbiAgICAgICAgbGV0IHkgPSAyMDtcbiAgICAgICAgZm9yIChjb25zdCB0cm9waHlJY29uUm93IG9mIGNvbnRlbnQuVHJvcGh5SWNvbnMuc3BsaXQoJ1xcbicpKSB7XG4gICAgICAgICAgICB0aGlzLnRhcmdldC50ZXN0Q29udGV4dC5maWxsVGV4dCh0cm9waHlJY29uUm93LCAwLCB5KTtcbiAgICAgICAgICAgIHkgKz0gdGV4dEhlaWdodDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBwdWJsaWMgc3RhcnQoKSB7XG4gICAgICAgIHRoaXMuc2V0U3RhdGUoeyB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldENlbGwocG9zaXRpb246IFtudW1iZXIsIG51bWJlcl0pOiBDZWxsU3RhdGUge1xuICAgICAgICByZXR1cm4gdGhpcy5zdGF0ZS5jZWxscy5maW5kKGMgPT4gYy5wb3NpdGlvblswXSA9PSBwb3NpdGlvblswXSAmJiBjLnBvc2l0aW9uWzFdID09IHBvc2l0aW9uWzFdKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGhhbmRsZUNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgaWYgKGUudGFyZ2V0ICE9IHRoaXMudGFyZ2V0Lm1haW4gJiYgZS50YXJnZXQgIT0gdGhpcy50YXJnZXQudG9wKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB7IGNlbGxzLCBsZXZlbCwgaW5pdGlhbEFscGhhIH0gPSB0aGlzLnN0YXRlO1xuXG4gICAgICAgIGlmIChsZXZlbCA9PSAtMSAmJiBwYXJzZUludChpbml0aWFsQWxwaGEudG9TdHJpbmcoKSkgIT0gMTApIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNldFN0YXRlKHsgaW5pdGlhbEFscGhhOiBpbml0aWFsQWxwaGEgKyAxIH0pO1xuICAgICAgICB9IFxuICAgICAgICBpZiAobGV2ZWwgPT0gLTEgLyogaW5pdGlhbEFscGhhID09IDEwICovKSB7XG4gICAgICAgICAgICBjb25zdCBuZXdDZWxsczogQ2VsbFN0YXRlW10gPSBbeyBwb3NpdGlvbjogWzMsIDQxXSwgdHlwZTogJ2RvdC1zb3VyY2UnLCBkaXNwbGF5OiAnYWN0aXZlJywgYmVhY29uVmFsdWU6IDAgIH1dO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0U3RhdGUoeyBjZWxsczogbmV3Q2VsbHMsIGxldmVsOiAwIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChsZXZlbCA9PSAwKSB7XG4gICAgICAgICAgICBjb25zdCBwb3NpdGlvbjogW251bWJlciwgbnVtYmVyXSA9IFswLCAwXTtcbiAgICAgICAgICAgIGlmIChwb3NpdGlvblswXSA9PSAtMSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY2VsbCA9IHRoaXMuZ2V0Q2VsbChwb3NpdGlvbik7XG4gICAgICAgICAgICBpZiAoIWNlbGwpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChjZWxsLnR5cGUgPT0gJ2RvdC1zb3VyY2UnIHx8IGNlbGwudHlwZSA9PSAnZG90Jykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuZE9mRG90Q29sdW1uID0gcmFuZ2UoY2VsbC5wb3NpdGlvblsxXSAtIDEsIDAsIC0xKS5maW5kKGMgPT4gdGhpcy5nZXRDZWxsKFtjZWxsLnBvc2l0aW9uWzBdLCBjXSk/LnR5cGUgIT0gJ2RvdCcpO1xuICAgICAgICAgICAgICAgIGlmICghZW5kT2ZEb3RDb2x1bW4gfHwgZW5kT2ZEb3RDb2x1bW4gPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47IC8vIGRvdCBoYXMgcmVhY2hlZCBsZWZ0IGVuZCBvZiBtYXAsIG5vdGhpbmcgaGFwcGVuc1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IHRvYmVEb3RDZWxsID0gdGhpcy5nZXRDZWxsKFtjZWxsLnBvc2l0aW9uWzBdLCBlbmRPZkRvdENvbHVtbiAtIDFdKTtcbiAgICAgICAgICAgICAgICBpZiAodG9iZURvdENlbGwpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhlIGNlbGwgZXhpc3RzLCBhbGwgdHlwZSB3aWxsIHByZXZlbnQgZG90IGZyb20gaW5jcmVhc2luZywgbm90aGluZyBoYXBwZW5zXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBjZWxsQ29uZmlnID0gY29udGVudC5NYXBbY2VsbC5wb3NpdGlvblswXV1bZW5kT2ZEb3RDb2x1bW4gLSAxXTtcbiAgICAgICAgICAgICAgICBpZiAoY2VsbENvbmZpZyA9PSAnJykge1xuICAgICAgICAgICAgICAgICAgICAvLyBleHBhbmQgZG90XG4gICAgICAgICAgICAgICAgICAgIGNlbGxzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IFtjZWxsLnBvc2l0aW9uWzBdLCBlbmRPZkRvdENvbHVtbiAtIDFdLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2RvdCcsXG4gICAgICAgICAgICAgICAgICAgICAgICBkaXNwbGF5OiAncmV2ZWFsZWQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgYmVhY29uVmFsdWU6IDAsXG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgfSBpZiAoY2VsbENvbmZpZyA9PSAnKycpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaGl0IHBpcGUgc291cmNlLCBjcmVhdGUgYW4gYWN0aXZlIHVua25vd25cbiAgICAgICAgICAgICAgICAgICAgY2VsbHMucHVzaCh7IFxuICAgICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IFtjZWxsLnBvc2l0aW9uWzBdLCBlbmRPZkRvdENvbHVtbiAtIDFdLCBcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU6ICdwaXBlLXNvdXJjZScsXG4gICAgICAgICAgICAgICAgICAgICAgICBkaXNwbGF5OiAnaW5hY3RpdmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgYmVhY29uVmFsdWU6IDAsXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gaWYgKC9cXGQvLnRlc3QoY2VsbENvbmZpZykpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmVhY29uVmFsdWUgPSBwYXJzZUludChjZWxsQ29uZmlnKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGJlYWNvblZhbHVlID09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGhpdCB1bnRvdWNoZWQgMCwgcmV2ZWFsIGl0XG4gICAgICAgICAgICAgICAgICAgICAgICBjZWxscy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogW2NlbGwucG9zaXRpb25bMF0sIGVuZE9mRG90Q29sdW1uIC0gMV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ3plcm8nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRpc3BsYXk6ICdyZXZlYWxlZCcsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYmVhY29uVmFsdWU6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChiZWFjb25WYWx1ZSA+PSBsZXZlbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaGl0IGJlYWNvbiwgY3JlYXRlcyBhbiBhY3RpdmUgdW5rbm93blxuICAgICAgICAgICAgICAgICAgICAgICAgY2VsbHMucHVzaCh7IFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBbY2VsbC5wb3NpdGlvblswXSwgZW5kT2ZEb3RDb2x1bW4gLSAxXSwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogJ2JlYWNvbicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGlzcGxheTogJ2luYWN0aXZlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiZWFjb25WYWx1ZTogYmVhY29uVmFsdWUsXG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgYW5pbWF0aW9uRnJhbWVDYWxsYmFja0hhbmRsZXI/OiBudW1iZXI7XG4gICAgcHJpdmF0ZSBzY2hlZHVsZTogU2NoZWR1bGVFbnRyeVtdO1xuICAgIHByaXZhdGUgc2V0U3RhdGUobmV3UGFydGlhbFN0YXRlOiBQYXJ0aWFsPEdhbWVTdGF0ZT4pIHtcbiAgICAgICAgY29uc3QgbmV3U3RhdGUgPSBPYmplY3QuYXNzaWduKHsgLi4udGhpcy5zdGF0ZSwgY2VsbHM6IHRoaXMuc3RhdGUuY2VsbHMubWFwKGMgPT4gKHsgLi4uYyB9KSkgfSwgbmV3UGFydGlhbFN0YXRlKTtcbiAgICAgICAgZG8ge1xuICAgICAgICAgICAgaWYgKG5ld1N0YXRlLmxldmVsID09IC0xICYmIG5ld1N0YXRlLmluaXRpYWxBbHBoYSAhPSAwKSB7IC8vIGluaXRpYWwgc2VudGVuY2UgYWxwaGEgaW5jcmVhc2UsIHNjaGVkdWxlIG1heSBjb250YWluIGVsZW1lbnRcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zY2hlZHVsZS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjaGVkdWxlID0gW3sgdHlwZTogJ2luaXRpYWwtc2VudGVuY2UnLCBpbml0aWFsU2VudGVuY2VBbHBoYTogbmV3U3RhdGUuaW5pdGlhbEFscGhhIC8gMTAgfV07XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2NoZWR1bGVbMF0uaW5pdGlhbFNlbnRlbmNlQWxwaGEgPSBuZXdTdGF0ZS5pbml0aWFsQWxwaGEgLyAxMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gd2hpbGUgKGZhbHNlKTtcblxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMuc3RhdGUsIG5ld1N0YXRlKTtcbiAgICAgICAgaWYgKHRoaXMuc2NoZWR1bGUubGVuZ3RoICE9IDAgJiYgIXRoaXMuYW5pbWF0aW9uRnJhbWVDYWxsYmFja0hhbmRsZXIpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdzY2hlZHVsZTogJywgSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh0aGlzLnNjaGVkdWxlKSkpO1xuICAgICAgICAgICAgdGhpcy5hbmltYXRpb25GcmFtZUNhbGxiYWNrSGFuZGxlciA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLnJlbmRlcik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcHJpdmF0ZSByZW5kZXIgPSAodGltZTogbnVtYmVyKSA9PiB7XG4gICAgICAgIGNvbnN0IHsgbWFpbkNvbnRleHQ6IG14LCB0b3BDb250ZXh0OiBweCwgdGVzdENvbnRleHQ6IHR4IH0gPSB0aGlzLnRhcmdldDtcbiAgICAgICAgY29uc29sZS5sb2coJ3JlbmRlcjogJywgeyB0aW1lIH0pO1xuXG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnNjaGVkdWxlLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmICh0aGlzLnNjaGVkdWxlLmxlbmd0aCA9PSAxICYmIHRoaXMuc2NoZWR1bGVbMF0udHlwZSA9PSAnaW5pdGlhbC1zZW50ZW5jZScpIHtcbiAgICAgICAgICAgICAgICBweC5nbG9iYWxBbHBoYSA9IHRoaXMuc2NoZWR1bGVbMF0uaW5pdGlhbFNlbnRlbmNlQWxwaGE7XG4gICAgICAgICAgICAgICAgcHguY2xlYXJSZWN0KDAsIDAsIDQwMCwgNDAwKTtcbiAgICAgICAgICAgICAgICBweC5maWxsVGV4dCgnVGhpcyBwYWdlIGlzIGludGVudGlvbmFsbHkgbGVmdCBibGFuay4nLCAzMCwgNTApO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IHdoaWxlIChmYWxzZSk7XG5cbiAgICAgICAgdGhpcy5hbmltYXRpb25GcmFtZUNhbGxiYWNrSGFuZGxlciA9IG51bGw7XG4gICAgICAgIHRoaXMuc2NoZWR1bGUgPSBbXTtcbiAgICB9XG59XG4iLCJpbXBvcnQgeyBNQVBfU0NIRU1BVElDLCBUUk9QSElFUyB9IGZyb20gJy4vdWknO1xuaW1wb3J0IHsgR2FtZSB9IGZyb20gJy4vZ2FtZSc7XG5cbm5ldyBHYW1lKHsgXG4gICAgICAgIG1haW46IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2NhbnZhcyNtYWluLWxheWVyJyksXG4gICAgICAgIHRvcDogZG9jdW1lbnQucXVlcnlTZWxlY3RvcignY2FudmFzI3RvcC1sYXllcicpLFxuICAgICAgICB0ZXN0OiBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdjYW52YXMjdGVzdC1sYXllcicpIH0pXG4gICAgLmluaXQoKVxuICAgIC5zdGFydCgpO1xuXG5jb25zdCBlbGVtZW50cyA9IHtcbiAgICBbJ3Bvd2Vycy1jb250YWluZXInXTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Bvd2Vycy1jb250YWluZXInKSxcbiAgICBbJ3Bvd2VyLWNvbnRhaW5lcnMnXTogZG9jdW1lbnQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZSgncG93ZXItY29udGFpbmVyJyksXG4gICAgWydwb3dlci0yLWJ1dHRvbiddOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncG93ZXItMi1idXR0b24nKSBhcyBIVE1MSW5wdXRFbGVtZW50LFxuICAgIFsncG93ZXItMy1jaGVja2JveCddOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncG93ZXItMy1jaGVjaycpIGFzIEhUTUxJbnB1dEVsZW1lbnQsXG4gICAgWyd0cm9waHktY29udGFpbmVyJ106IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0cm9waHktY29udGFpbmVyJyksXG4gICAgWyd0cm9waHktbW9uZXknXTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Ryb3BoeS1tb25leScpLFxuICAgIFsndHJvcGh5LWNhc2UnXTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Ryb3BoeS1jYXNlJyksXG4gICAgWyd0cm9waHktbmV4dCddOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndHJvcGh5LW5leHQnKSxcbiAgICBbJ21haW4tY29udGFpbmVyJ106IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtYWluLWNvbnRhaW5lcicpIGFzIEhUTUxQcmVFbGVtZW50LFxufTtcblxuZW51bSBDbGFzc05hbWVzIHtcbiAgICBGYWludCA9ICdmYWludCcsXG4gICAgU2xpZGVyID0gJ3NsaWRlcicsXG4gICAgSW52aXNpYmxlID0gJ2ludmlzaWJsZScsXG4gICAgQmVhY29uRGlzYWJsZWQgPSAnYmVhY29uLWRpc2FibGVkJyxcbn1cblxudHlwZSBDZWxsQmVhY29uVHlwZSA9ICdub25lJyB8ICdkaXNhYmxlZCcgfCAnaW5hY3RpdmUnIHwgJ2FjdGl2ZScgfCAnbGV2ZWwtZmluaXNoZWQnO1xuY29uc3QgQ2VsbEJlYWNvblR5cGVzID0gWydkaXNhYmxlZCcsICdpbmFjdGl2ZScsICdhY3RpdmUnLCAnbGV2ZWwtZmluaXNoZWQnXTtcblxuY2xhc3MgQ2VsbCB7XG4gICAgY29uc3RydWN0b3IoXG4gICAgICAgIHB1YmxpYyByZWFkb25seSByb3c6IG51bWJlciwgXG4gICAgICAgIHB1YmxpYyByZWFkb25seSBjb2x1bW46IG51bWJlcixcbiAgICAgICAgcHVibGljIGVsZW1lbnQ6IEhUTUxTcGFuRWxlbWVudCxcbiAgICAgICAgcHVibGljIGRpc3BsYXk6ICdoaWRkZW4nIHwgJ2ZhaW50JyB8ICd1bmtub3duJyB8ICd2aXNpYmxlJyxcbiAgICAgICAgcHVibGljIGNoYXI6IHN0cmluZyxcbiAgICApIHt9XG5cbiAgICBwdWJsaWMgZ2V0IGlzSW5pdGlhbFNlbnRlbmNlKCk6IGJvb2xlYW4geyByZXR1cm4gL1tUYS16XS8udGVzdCh0aGlzLmNoYXIpOyB9XG4gICAgcHVibGljIGdldCBpc0JlYWNvbigpOiBib29sZWFuIHsgcmV0dXJuIC9cXGQvLnRlc3QodGhpcy5jaGFyKTsgfSAvLyBiZWFjb24gaXMgbnVtYmVyXG4gICAgcHVibGljIGdldCBpc0JlYWNvbkFjdGl2ZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuaXNCZWFjb24gJiYgaGFzVmlzaWJsZU5laWdoYm91cih0aGlzKTsgfVxuICAgIHB1YmxpYyBnZXQgaXNDbGVhcigpOiBib29sZWFuIHsgcmV0dXJuIC9bIE5TRVddLy50ZXN0KHRoaXMuY2hhcik7IH0gLy8gQ2hlY2tzIGlmIGEgY2VsbCBvbiB0aGUgZ2FtZS5jZWxscyBpcyBpc0NsZWFyIG9mIG9ic3RhY2xlc1xuXG4gICAgcHVibGljIHNldCBpbnRlcmFjdGl2ZSh2YWx1ZTogYm9vbGVhbikgeyBcbiAgICAgICAgdmFsdWUgPyB0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaW50ZXJhY3RpdmUnKSA6IHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdpbnRlcmFjdGl2ZScpO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXQgYmVhY29uVHlwZSgpOiBDZWxsQmVhY29uVHlwZSB7XG4gICAgICAgIGZvciAoY29uc3QgdmFsdWUgb2YgQ2VsbEJlYWNvblR5cGVzKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5lbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnYmVhY29uLScgKyB2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWUgYXMgQ2VsbEJlYWNvblR5cGU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcHVibGljIHNldCBiZWFjb25UeXBlKHZhbHVlOiBDZWxsQmVhY29uVHlwZSkge1xuICAgICAgICB0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnYmVhY29uLScgKyB2YWx1ZSk7XG4gICAgICAgIGZvciAoY29uc3Qgb3RoZXJWYWx1ZSBvZiBDZWxsQmVhY29uVHlwZXMuZmlsdGVyKHQgPT4gdCAhPSB2YWx1ZSkpIHtcbiAgICAgICAgICAgIHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdiZWFjb24tJyArIG90aGVyVmFsdWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIHJlZnJlc2goKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZWxlbWVudC5pbm5lckhUTUwgPSB0aGlzLmNoYXI7XG4gICAgICAgIHRoaXMuaW50ZXJhY3RpdmUgPSBpc0ludGVyYWN0aXZlKHRoaXMpO1xuICAgIH1cbn1cblxuY2xhc3MgR2FtZU9sZCB7XG4gICAgcHVibGljIHN0YXRpYyBSb3dDb3VudCA9IE1BUF9TQ0hFTUFUSUMubGVuZ3RoO1xuICAgIHB1YmxpYyBzdGF0aWMgQ29sdW1uQ291bnQgPSBNQVBfU0NIRU1BVElDWzBdLmxlbmd0aDtcblxuICAgIHB1YmxpYyByZWFkb25seSBjZWxsczogUmVhZG9ubHlBcnJheTxSZWFkb25seUFycmF5PENlbGw+PjsgLy8gaW5kZXggMSBpcyByb3csIHN0YXJ0IGZyb20gMDsgaW5kZXggMiBpcyBjb2wsIHN0YXJ0IGZyb20gMFxuICAgIHB1YmxpYyByZWFkb25seSBiZWFjb25zOiBSZWFkb25seUFycmF5PFJlYWRvbmx5QXJyYXk8Q2VsbD4+OyAvLyBpbmRleCAxIGlzIGxldmVsLCBzdGFydCBmcm9tIDAgdG8gNjsgaW5kZXggMiBpcyBzaW1wbGUgaW5kZXg7IHNhbWUgcmVmZXJlbmNlIGZyb20gY2VsbHNcbiAgICBwcml2YXRlIF9zbGlkZXI6IENlbGw7IC8vIHNhbWUgcmVmZXJlbmNlIGZyb20gY2VsbHNcbiAgICBwcml2YXRlIF9wb3dlckxldmVsOiBudW1iZXI7XG5cbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgY29uc3QgY2VsbHMgPSBbXTtcbiAgICAgICAgY29uc3QgYmVhY29ucyA9IFtbXSwgW10sIFtdLCBbXSwgW10sIFtdLCBbXV07XG4gICAgICAgIGZvciAoY29uc3QgW3Jvd0luZGV4LCByb3dDb25maWddIG9mIE1BUF9TQ0hFTUFUSUMuZW50cmllcygpKSB7XG4gICAgICAgICAgICBjb25zdCByb3dDZWxsczogQ2VsbFtdID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtjb2x1bW5JbmRleCwgY2VsbENvbmZpZ10gb2YgQXJyYXkuZnJvbShyb3dDb25maWcpLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjZWxsJyk7XG5cbiAgICAgICAgICAgICAgICBlbGVtZW50Lm9uY2xpY2sgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIG9uU3BhbkNsaWNrKHJvd0luZGV4LCBjb2x1bW5JbmRleCk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICBlbGVtZW50Lm9uY29udGV4dG1lbnUgPSAoZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDEwOyArK2kpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9uU3BhbkNsaWNrKHJvd0luZGV4LCBjb2x1bW5JbmRleCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgZWxlbWVudHNbJ21haW4tY29udGFpbmVyJ10uYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBjZWxsID0gbmV3IENlbGwocm93SW5kZXgsIGNvbHVtbkluZGV4LCBlbGVtZW50LCAnaGlkZGVuJywgY2VsbENvbmZpZyk7XG4gICAgICAgICAgICAgICAgaWYgKGNlbGwuaXNCZWFjb24pIHtcbiAgICAgICAgICAgICAgICAgICAgYmVhY29uc1twYXJzZUludChjZWxsLmNoYXIpXS5wdXNoKGNlbGwpO1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2JlYWNvbicpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByb3dDZWxscy5wdXNoKGNlbGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2VsbHMucHVzaChyb3dDZWxscyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXZlYWwgdGhlIGZpcnN0IHBhcnQgb2YgdGhlIGdhbWUuY2VsbHM6IHRoZSBmaXJzdCBzZW50ZW5jZVxuICAgICAgICBmb3IgKGxldCBpID0gMzsgaSA8IDQyOyBpKyspIHtcbiAgICAgICAgICAgIGNlbGxzWzRdW2ldLmRpc3BsYXkgPSAndmlzaWJsZSc7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmNlbGxzID0gY2VsbHM7XG4gICAgICAgIHRoaXMuYmVhY29ucyA9IGJlYWNvbnM7XG4gICAgICAgIHRoaXMuX3NsaWRlciA9IGNlbGxzWzBdWzBdO1xuICAgICAgICB0aGlzLl9wb3dlckxldmVsID0gMDtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlZnJlc2hTbGlkZXIoKSB7XG4gICAgICAgIC8vIFVwZGF0ZSB0aGUgY2VsbHMgYXJvdW5kIHRoZSBzbGlkZXIuIEFkZHMgTlNFVyBhbmQgbWFrZXMgbmVpZ2hib3VycyB2aXNpYmxlLlxuXG4gICAgICAgIGNvbnN0IHsgbGVmdCwgcmlnaHQsIHVwLCBkb3duIH0gPSBnZXROZWlnaGJvdXJzKHRoaXMuX3NsaWRlcik7XG4gICAgICAgIGlmICh1cD8uaXNDbGVhcikge1xuICAgICAgICAgICAgdXAuZWxlbWVudC5pbm5lckhUTUwgPSB1cC5jaGFyID0gJ04nO1xuICAgICAgICAgICAgcmlnaHQuaW50ZXJhY3RpdmUgPSB0cnVlO1xuICAgICAgICAgICAgdXAuZGlzcGxheSA9ICd2aXNpYmxlJztcbiAgICAgICAgfVxuICAgICAgICBpZiAoZG93bj8uaXNDbGVhcikge1xuICAgICAgICAgICAgZG93bi5lbGVtZW50LmlubmVySFRNTCA9IGRvd24uY2hhciA9ICdTJztcbiAgICAgICAgICAgIHJpZ2h0LmludGVyYWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgIGRvd24uZGlzcGxheSA9ICd2aXNpYmxlJztcbiAgICAgICAgfVxuICAgICAgICBpZiAocmlnaHQ/LmlzQ2xlYXIpIHtcbiAgICAgICAgICAgIHJpZ2h0LmVsZW1lbnQuaW5uZXJIVE1MID0gcmlnaHQuY2hhciA9ICdFJztcbiAgICAgICAgICAgIHJpZ2h0LmludGVyYWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgIHJpZ2h0LmRpc3BsYXkgPSAndmlzaWJsZSc7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxlZnQ/LmlzQ2xlYXIpIHtcbiAgICAgICAgICAgIGxlZnQuZWxlbWVudC5pbm5lckhUTUwgPSBsZWZ0LmNoYXIgPSAnVyc7XG4gICAgICAgICAgICByaWdodC5pbnRlcmFjdGl2ZSA9IHRydWU7XG4gICAgICAgICAgICBsZWZ0LmRpc3BsYXkgPSAndmlzaWJsZSc7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcHJpdmF0ZSByZWZyZXNoQ2VsbHMoKSB7XG4gICAgICAgIC8vIFVwZGF0ZXMgdGhlIHZpc2liaWxpdHkgb2YgdGhlIGVudGlyZSBnYW1lLmNlbGxzLlxuXG4gICAgICAgIGlmICh0aGlzLl9wb3dlckxldmVsID49IDQpIHsgLy8gc2xpZGVyIHJlcXVpcmVzIHBvd2VyIGxldmVsIDRcbiAgICAgICAgICAgIC8vIEluaXRpYWxpc2UgdGhlIHNsaWRlci5cbiAgICAgICAgICAgIHRoaXMuX3NsaWRlci5kaXNwbGF5ID0gJ3Zpc2libGUnO1xuICAgICAgICAgICAgdGhpcy5fc2xpZGVyLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZShDbGFzc05hbWVzLkZhaW50KTtcbiAgICAgICAgICAgIHRoaXMuX3NsaWRlci5lbGVtZW50LmNsYXNzTGlzdC5hZGQoQ2xhc3NOYW1lcy5TbGlkZXIpO1xuICAgICAgICAgICAgdGhpcy5yZWZyZXNoU2xpZGVyKCk7XG4gICAgICAgICAgICB0aGlzLl9zbGlkZXIucmVmcmVzaCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChjb25zdCByb3cgb2YgdGhpcy5jZWxscykge1xuICAgICAgICAgICAgZm9yIChjb25zdCBjZWxsIG9mIHJvdykge1xuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIGFueSBjZWxscyBuZWVkIHRvIGJlIHByb21vdGVkIGluIHZpc2liaWxpdHkuXG4gICAgICAgICAgICAgICAgaWYgKGNlbGwuZGlzcGxheSA9PT0gJ2hpZGRlbicpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgc2hvdWxkIGJlIHJldmVhbGVkPyBXaGVuIG5leHQgdG8gYSB2aXNpYmxlIGFuZCBhY3RpdmUgY2hhclxuICAgICAgICAgICAgICAgICAgICBpZiAoaGFzVmlzaWJsZU5laWdoYm91cihjZWxsKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRW1wdHkgY2VsbHMgYW5kIDAtYmVhY29ucyBnZXQgZnVsbHkgcmV2ZWFsZWQgaW1tZWRpYXRlbHkuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBPdGhlciBub24tZW1wdHkgY2VsbHMgZ2V0ID9cbiAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuZGlzcGxheSA9IChjZWxsLmNoYXIgPT09ICcgJyB8fCBjZWxsLmNoYXIgPT09ICcwJykgPyAndmlzaWJsZScgOiAndW5rbm93bic7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoKHRoaXMuX3Bvd2VyTGV2ZWwgPiAwICYmIGhhc1Zpc2libGVOZWlnaGJvdXIoY2VsbCwgMikpIHx8IHRoaXMuX3Bvd2VyTGV2ZWwgPj0gNSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2l0aCBQZXJjZXB0aW9uICssIG1heSBjaGVjayBkaXN0YW5jZSAyLlxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2l0aCBQZXJjZXB0aW9uICsrLCBjYW4gc2VlIHRoZSBlbnRpcmUgZ2FtZS5jZWxscyBmYWludGx5LlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNlbGwuY2hhciA9PT0gJyAnIHx8IGNlbGwuY2hhciA9PT0gJzAnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5kaXNwbGF5ID0gJ3Zpc2libGUnOyAgLy8gUmV2ZWFsIHNvbWUgY2VsbHMgaW1tZWRpYXRlbHkuXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuZGlzcGxheSA9ICdmYWludCc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoQ2xhc3NOYW1lcy5GYWludCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNlbGwuZGlzcGxheSA9PT0gJ2ZhaW50JyAmJiBoYXNWaXNpYmxlTmVpZ2hib3VyKGNlbGwpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEdvIGZyb20gZmFpbnQgdG8gcXVlc3Rpb24gb3IgdmlzaWJsZVxuICAgICAgICAgICAgICAgICAgICBjZWxsLmRpc3BsYXkgPSAoY2VsbC5jaGFyID09PSAnICcgfHwgY2VsbC5jaGFyID09PSAnMCcpID8gJ3Zpc2libGUnIDogJ3Vua25vd24nO1xuICAgICAgICAgICAgICAgICAgICBjZWxsLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZShDbGFzc05hbWVzLkZhaW50KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgdGhlIGFwcGVhcmFuY2Ugb2YgdGhlIGNlbGxzXG4gICAgICAgICAgICAgICAgaWYgKGNlbGwuZGlzcGxheSA9PT0gJ2hpZGRlbicpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSGlkZGVuIGNlbGxzIGRpc3BsYXkgYXMgZW1wdHkuXG4gICAgICAgICAgICAgICAgICAgIGNlbGwuZWxlbWVudC5pbm5lckhUTUwgPSAnICc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjZWxsLmRpc3BsYXkgPT09ICdmYWludCcpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVW5rbm93biBjZWxscyBkaXNwbGF5IGFzICc/J1xuICAgICAgICAgICAgICAgICAgICBjZWxsLmVsZW1lbnQuaW5uZXJIVE1MID0gJz8nO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY2VsbC5kaXNwbGF5ID09PSAndW5rbm93bicpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVW5rbm93biBjZWxscyBkaXNwbGF5IGFzICc/J1xuICAgICAgICAgICAgICAgICAgICBjZWxsLmVsZW1lbnQuaW5uZXJIVE1MID0gJz8nO1xuICAgICAgICAgICAgICAgICAgICBjZWxsLmludGVyYWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBSZXZlYWxlZCBjZWxscyBkaXNwbGF5IGFzIG5vcm1hbC5cbiAgICAgICAgICAgICAgICAgICAgY2VsbC5yZWZyZXNoKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHByaXZhdGUgcmVmcmVzaEJlYWNvbnMoKSB7XG4gICAgICAgIC8vIFplcm8gZ3JvdXAgKGFudGktYmVhY29ucykgb3ZlcnJpZGVzIGFsbC4gTWFrZXMgYWxsIGJlYWNvbnMgaGlnaGxpZ2h0LlxuICAgICAgICBpZiAodGhpcy5iZWFjb25zWzBdLnNvbWUoYyA9PiBjLmlzQmVhY29uQWN0aXZlKSkge1xuICAgICAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiB0aGlzLmJlYWNvbnMpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGNlbGwgb2YgZ3JvdXApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNlbGwuZGlzcGxheSA9PT0gJ3Zpc2libGUnICYmIGNlbGwuaXNCZWFjb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYmVhY29uVHlwZSA9ICdkaXNhYmxlZCc7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBEZWFjdGlhdGUgdGhlIHplcm8gYmVhY29uc1xuICAgICAgICAgICAgZm9yIChjb25zdCBjZWxsIG9mIHRoaXMuYmVhY29uc1swXSkge1xuICAgICAgICAgICAgICAgIGNlbGwuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKENsYXNzTmFtZXMuQmVhY29uRGlzYWJsZWQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCA3OyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGdyb3VwID0gdGhpcy5iZWFjb25zW2ldO1xuICAgICAgICAgICAgLy8gSWYgZW50aXJlIGdyb3VwIGFjdGl2ZSwgaGlnaGxpZ2h0IHRoZW0gYWxsIGFuZCBtYWtlIGFjdGl2ZS5cbiAgICAgICAgICAgIGlmICghZ3JvdXAuc29tZShjID0+ICFjLmlzQmVhY29uQWN0aXZlKSkge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgY2VsbCBvZiBncm91cCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY2VsbC5kaXNwbGF5ID09PSAndmlzaWJsZScpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuaW50ZXJhY3RpdmUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5iZWFjb25UeXBlID0gJ2xldmVsLWZpbmlzaGVkJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIE90aGVyd2lzZSBoaWdobGlnaHQgdGhlbSBkZXBlbmRpbmcgb24gd2hldGhlciB0aGV5IGFyZSBhY3RpdmVcbiAgICAgICAgICAgIGZvciAoY29uc3QgY2VsbCBvZiBncm91cCkge1xuICAgICAgICAgICAgICAgIC8vIEFsc28gbmVlZCB0byBjaGVjayB0aGF0IHRoZSBiZWFjb24gaXMgc3RpbGwgdGhlcmUuLi5cbiAgICAgICAgICAgICAgICBpZiAoY2VsbC5kaXNwbGF5ID09PSAndmlzaWJsZScgJiYgY2VsbC5jaGFyID09PSBTdHJpbmcoaSkpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGhhc1Zpc2libGVOZWlnaGJvdXIoY2VsbCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNlbGwuYmVhY29uVHlwZSA9ICdhY3RpdmUnO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2VsbC5iZWFjb25UeXBlID0gJ2luYWN0aXZlJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEludmlzaWJsZSBvciBkZWFjdGl2YXRlZCBiZWFjb24gY2VsbFxuICAgICAgICAgICAgICAgICAgICBjZWxsLmJlYWNvblR5cGUgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHB1YmxpYyByZWZyZXNoKCkge1xuICAgICAgICB0aGlzLnJlZnJlc2hDZWxscygpO1xuICAgICAgICB0aGlzLnJlZnJlc2hCZWFjb25zKCk7XG4gICAgfVxuXG4gICAgcHVibGljIGdldCBzbGlkZXIoKTogQ2VsbCB7IHJldHVybiB0aGlzLl9zbGlkZXI7IH1cbiAgICBwdWJsaWMgc2V0IHNsaWRlcihuZXdDZWxsOiBDZWxsKSB7XG4gICAgICAgIC8vIFVwZGF0ZXMgc3R5bGVzIG9uIHRoZSBvbGQgY2VsbFxuICAgICAgICB0aGlzLl9zbGlkZXIuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKENsYXNzTmFtZXMuU2xpZGVyKTtcbiAgICAgICAgdGhpcy5fc2xpZGVyLmNoYXIgPSAnICc7XG4gICAgXG4gICAgICAgIC8vIENsZWFyIHRoZSBkaXJlY3Rpb25zXG4gICAgICAgIGNvbnN0IHsgbGVmdCwgcmlnaHQsIHVwLCBkb3duIH0gPSBnZXROZWlnaGJvdXJzKHRoaXMuX3NsaWRlcik7XG4gICAgICAgIGlmICh1cCAmJiB1cC5jaGFyID09PSAnTicpIHtcbiAgICAgICAgICAgIHVwLmNoYXIgPSAnICc7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGRvd24gJiYgZG93bi5jaGFyID09PSAnUycpIHtcbiAgICAgICAgICAgIGRvd24uY2hhciA9ICcgJztcbiAgICAgICAgfVxuICAgICAgICBpZiAocmlnaHQgJiYgcmlnaHQuY2hhciA9PT0gJ0UnKSB7XG4gICAgICAgICAgICByaWdodC5jaGFyID0gJyAnO1xuICAgICAgICB9XG4gICAgICAgIGlmIChsZWZ0ICYmIGxlZnQuY2hhciA9PT0gJ1cnKSB7XG4gICAgICAgICAgICBsZWZ0LmNoYXIgPSAnICc7XG4gICAgICAgIH1cbiAgICBcbiAgICAgICAgbmV3Q2VsbC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoQ2xhc3NOYW1lcy5TbGlkZXIpO1xuICAgICAgICBuZXdDZWxsLmNoYXIgPSAnQCc7XG4gICAgICAgIHRoaXMuX3NsaWRlciA9IG5ld0NlbGw7XG4gICAgfVxuXG4gICAgcHVibGljIGdldCBwb3dlckxldmVsKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9wb3dlckxldmVsOyB9XG4gICAgcHVibGljIHNldCBwb3dlckxldmVsKG5ld1ZhbHVlOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKG5ld1ZhbHVlIDwgMCB8fCBuZXdWYWx1ZSA+IDYpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdpbnZhbGlkIHBvd2VyIGxldmVsJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBFeHRyYSBjb2RlIHRvIG1ha2UgdGhlIHBvd2VycyBjb250YWluZXIgYXBwZWFyXG4gICAgICAgIGlmIChlbGVtZW50c1sncG93ZXJzLWNvbnRhaW5lciddLmNsYXNzTGlzdC5jb250YWlucyhDbGFzc05hbWVzLkludmlzaWJsZSkpIHtcbiAgICAgICAgICAgIGVsZW1lbnRzWydwb3dlcnMtY29udGFpbmVyJ10uY2xhc3NMaXN0LnJlbW92ZShDbGFzc05hbWVzLkludmlzaWJsZSk7XG4gICAgICAgICAgICBlbGVtZW50c1sncG93ZXJzLWNvbnRhaW5lciddLnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6ICdzbW9vdGgnIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fcG93ZXJMZXZlbCA9IG5ld1ZhbHVlO1xuXG4gICAgICAgIC8vIE1ha2UgcGFydHMgb2YgdGhlIGNvbnRhaW5lciBhcHBlYXJcbiAgICAgICAgZm9yIChsZXQgcCA9IDE7IHAgPD0gbmV3VmFsdWU7IHArKykge1xuICAgICAgICAgICAgY29uc3QgbGkgPSBlbGVtZW50c1sncG93ZXItY29udGFpbmVycyddW3AgLSAxXTtcbiAgICAgICAgICAgIGxpLmNsYXNzTGlzdC5yZW1vdmUoQ2xhc3NOYW1lcy5JbnZpc2libGUpO1xuICAgICAgICB9XG4gICAgICAgIGNoZWNrQ29tcGxldGlvbigpO1xuICAgIH1cbn1cblxuY29uc3QgZ28gPSBuZXcgR2FtZU9sZCgpO1xuXG5sZXQgY3VycmVuY3lDb2xsZWN0ZWQgPSAwO1xuLyoqIEluZGV4IG9mIG5leHQgdHJvcGh5LiAqL1xubGV0IG5leHRUcm9waHkgPSAwO1xuXG5jb25zdCBNQVhfQ1VSUkVOQ1kgPSAxMDAwO1xuXG5sZXQgaXNHYW1lSW50ZXJhY3RhYmxlID0gZmFsc2U7XG5cbi8qKlxuICogUmV0dXJucyB3aGV0aGVyIG9yIG5vdCBhdCBsZWFzdCBvbmUgb2YgdGhlIDQgbmVpZ2hib3Vyc1xuICogaXMgdmlzaWJsZSBhbmQgbm9uLWVtcHR5LlxuICpcbiAqIEBwYXJhbSBkaXN0IGRpc3RhbmNlIGZyb20gbWlkZGxlXG4gKi9cbmZ1bmN0aW9uIGhhc1Zpc2libGVOZWlnaGJvdXIoY2VsbDogQ2VsbCwgZGlzdCA9IDEpOiBib29sZWFuIHtcbiAgICBjb25zdCBuZWlnaGJvdXJzID0gZ2V0TmVpZ2hib3Vyc0FzQXJyYXkoY2VsbCwgZGlzdCk7XG4gICAgZm9yIChjb25zdCBuIG9mIG5laWdoYm91cnMpIHtcbiAgICAgICAgaWYgKG4uZGlzcGxheSA9PT0gJ3Zpc2libGUnICYmICFuLmlzQ2xlYXIpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBIYW5kbGVyIGZvciB3aGVuIGEgc3BhbiBpcyBjbGlja2VkLlxuICpcbiAqIEBwYXJhbSByIHJvdyBpbmRleFxuICogQHBhcmFtIGMgY29sIGluZGV4XG4gKi9cbmZ1bmN0aW9uIG9uU3BhbkNsaWNrKHJvdzogbnVtYmVyLCBjb2w6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IGNlbGwgPSBnby5jZWxsc1tyb3ddW2NvbF07XG5cbiAgICBpZiAoY2VsbC5kaXNwbGF5ID09PSAndW5rbm93bicpIHsgIC8vIE1heSBjbGljayAnPycgdG8gcmV2ZWFsIGl0XG4gICAgICAgIGNlbGwuZGlzcGxheSA9ICd2aXNpYmxlJztcbiAgICAgICAgZ28ucmVmcmVzaCgpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghaXNJbnRlcmFjdGl2ZShjZWxsKSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vIEluaXRpYWwgd29yZHMgZGlzYXBwZWFyIHdoZW4gY2xpY2tlZC5cbiAgICAvLyBIYWNreSBvcHRpbWlzYXRpb246IHNob3J0LWNpcmN1aXQgaWYgcG93ZXIgbGV2ZWwgaW5kaWNhdGVzIHByb2dyZXNzIGJleW9uZC5cbiAgICBpZiAoZ28ucG93ZXJMZXZlbCA8IDEgJiYgY2VsbC5pc0luaXRpYWxTZW50ZW5jZSkge1xuICAgICAgICAvLyBUbyBiZSBsZXNzIHRlZGlvdXMsIGFsc28gcmVtb3ZlcyBjb250aWd1b3VzIGxvd2VyY2FzZSBjaGFyYWN0ZXJzLlxuICAgICAgICBjZWxsLmNoYXIgPSAnICc7XG4gICAgICAgIGNvbnN0IHIgPSBjZWxsLnJvdztcbiAgICAgICAgbGV0IGMgPSAwO1xuICAgICAgICAvLyBHbyBsZWZ0XG4gICAgICAgIGMgPSBjZWxsLmNvbHVtbiAtIDE7XG4gICAgICAgIHdoaWxlIChjID49IDApIHtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRDZWxsID0gZ28uY2VsbHNbcl1bY107XG4gICAgICAgICAgICBpZiAoIShjdXJyZW50Q2VsbC5pc0luaXRpYWxTZW50ZW5jZSkpIHsgYnJlYWs7IH1cbiAgICAgICAgICAgIGN1cnJlbnRDZWxsLmNoYXIgPSAnICc7XG4gICAgICAgICAgICBjLS07XG4gICAgICAgIH1cbiAgICAgICAgLy8gR28gcmlnaHRcbiAgICAgICAgYyA9IGNlbGwuY29sdW1uICsgMTtcbiAgICAgICAgd2hpbGUgKGMgPCBHYW1lT2xkLkNvbHVtbkNvdW50KSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50Q2VsbCA9IGdvLmNlbGxzW3JdW2NdO1xuICAgICAgICAgICAgaWYgKCEoY3VycmVudENlbGwuaXNJbml0aWFsU2VudGVuY2UpKSB7IGJyZWFrOyB9XG4gICAgICAgICAgICBjdXJyZW50Q2VsbC5jaGFyID0gJyAnO1xuICAgICAgICAgICAgYysrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBnby5yZWZyZXNoKCk7XG4gICAgfVxuXG4gICAgaWYgKGNlbGwuY2hhciA9PT0gJy4nKSB7XG4gICAgICAgIGNvbnN0IHIgPSBjZWxsLnJvdztcbiAgICAgICAgbGV0IGMgPSAwO1xuICAgICAgICBpZiAoZWxlbWVudHNbJ3Bvd2VyLTMtY2hlY2tib3gnXS5jaGVja2VkKSB7XG4gICAgICAgICAgICBjID0gY2VsbC5jb2x1bW47XG4gICAgICAgICAgICB3aGlsZSAoYyA+PSAwKSB7XG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIGNlbGwgb24gdGhlIGxlZnQgaXMgbm90ICcuJyAoaW5jbHVkaW5nIG91dCBvZiBib3VuZHMpLCBtYXkgcmV0cmFjdFxuICAgICAgICAgICAgICAgIGlmIChjIC0gMSA8IDAgfHwgZ28uY2VsbHNbcl1bYyAtIDFdLmNoYXIgIT09ICcuJykge1xuICAgICAgICAgICAgICAgICAgICBnby5jZWxsc1tyXVtjXS5jaGFyID0gJyAnO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ28ucmVmcmVzaCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjLS07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gTWF5IGV4cGFuZCB0byB0aGUgbGVmdCBhcyBsb25nIGFzIHRoZXJlIGlzIHNwYWNlIGF0IHRoZSBlbmQgb2YgdGhlIC4uLlxuICAgICAgICBjID0gY2VsbC5jb2x1bW4gLSAxO1xuICAgICAgICB3aGlsZSAoYyA+PSAwKSB7XG4gICAgICAgICAgICBpZiAoZ28uY2VsbHNbcl1bY10uaXNDbGVhcikge1xuICAgICAgICAgICAgICAgIGdvLmNlbGxzW3JdW2NdLmNoYXIgPSAnLic7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGdvLnJlZnJlc2goKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChnby5jZWxsc1tyXVtjXS5jaGFyICE9PSAnLicpIHsgYnJlYWs7IH1cbiAgICAgICAgICAgIGMtLTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoY2VsbC5jaGFyID09PSAnKycpIHtcbiAgICAgICAgLy8gTWF5IGV4cGFuZCBvdXQgYXMgbG9uZyBhcyB0aGVyZSBpcyBlbXB0eSBzcGFjZSBhdCB0aGUgZW5kIG9mIGFueSBwaXBlLlxuICAgICAgICBsZXQgciA9IDA7XG4gICAgICAgIGxldCBjID0gMDtcbiAgICAgICAgLy8gR28gbGVmdFxuICAgICAgICByID0gY2VsbC5yb3c7XG4gICAgICAgIGMgPSBjZWxsLmNvbHVtbiAtIDE7XG4gICAgICAgIHdoaWxlIChjID49IDApIHtcbiAgICAgICAgICAgIGlmIChnby5jZWxsc1tyXVtjXS5pc0NsZWFyKSB7XG4gICAgICAgICAgICAgICAgZ28uY2VsbHNbcl1bY10uY2hhciA9ICctJztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChnby5jZWxsc1tyXVtjXS5jaGFyICE9PSAnLScpIHsgYnJlYWs7IH1cbiAgICAgICAgICAgIGMtLTtcbiAgICAgICAgfVxuICAgICAgICAvLyBHbyByaWdodFxuICAgICAgICBjID0gY2VsbC5jb2x1bW4gKyAxO1xuICAgICAgICB3aGlsZSAoYyA8IEdhbWVPbGQuQ29sdW1uQ291bnQpIHtcbiAgICAgICAgICAgIGlmIChnby5jZWxsc1tyXVtjXS5pc0NsZWFyKSB7XG4gICAgICAgICAgICAgICAgZ28uY2VsbHNbcl1bY10uY2hhciA9ICctJztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChnby5jZWxsc1tyXVtjXS5jaGFyICE9PSAnLScpIHsgYnJlYWs7IH1cbiAgICAgICAgICAgIGMrKztcbiAgICAgICAgfVxuICAgICAgICAvLyBHbyB1cFxuICAgICAgICByID0gY2VsbC5yb3cgLSAxO1xuICAgICAgICBjID0gY2VsbC5jb2x1bW47XG4gICAgICAgIHdoaWxlIChyID49IDApIHtcbiAgICAgICAgICAgIGlmIChnby5jZWxsc1tyXVtjXS5pc0NsZWFyKSB7XG4gICAgICAgICAgICAgICAgZ28uY2VsbHNbcl1bY10uY2hhciA9ICd8JztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChnby5jZWxsc1tyXVtjXS5jaGFyICE9PSAnfCcpIHsgYnJlYWs7IH1cbiAgICAgICAgICAgIHItLTtcbiAgICAgICAgfVxuICAgICAgICAvLyBHbyBkb3duXG4gICAgICAgIHIgPSBjZWxsLnJvdyArIDE7XG4gICAgICAgIHdoaWxlIChyIDwgR2FtZU9sZC5Sb3dDb3VudCkge1xuICAgICAgICAgICAgaWYgKGdvLmNlbGxzW3JdW2NdLmlzQ2xlYXIpIHtcbiAgICAgICAgICAgICAgICBnby5jZWxsc1tyXVtjXS5jaGFyID0gJ3wnO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGdvLmNlbGxzW3JdW2NdLmNoYXIgIT09ICd8JykgeyBicmVhazsgfVxuICAgICAgICAgICAgcisrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBnby5yZWZyZXNoKCk7XG4gICAgfVxuICAgIC8vIElmIGNsaWNrIG9uIGJlYWNvbiwgY2hlY2sgaWYgdGhlIG90aGVycyBhcmUgYWxsIGFjdGl2ZS4uLlxuICAgIGlmIChjZWxsLmlzQmVhY29uKSB7XG4gICAgICAgIGlmIChjZWxsLmJlYWNvblR5cGUgPT0gJ2xldmVsLWZpbmlzaGVkJykge1xuICAgICAgICAgICAgY29uc3QgbnVtQmVhY29uc0FjdGl2ZSA9IHBhcnNlSW50KGNlbGwuY2hhciwgMTApO1xuICAgICAgICAgICAgZ28ucG93ZXJMZXZlbCA9IG51bUJlYWNvbnNBY3RpdmU7XG4gICAgICAgICAgICBkZXN0cm95QW5kUmV2ZWFsQmVhY29ucyhudW1CZWFjb25zQWN0aXZlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZ28ucmVmcmVzaCgpO1xuICAgIH1cbiAgICAvLyBDdXJyZW5jeSBnZXRzIHJlcGxhY2VkIHdpdGggd2FsbCB3aGVuIGNvbGxlY3RlZC5cbiAgICBpZiAoY2VsbC5jaGFyID09PSAnJCcpIHtcbiAgICAgICAgYWRkQ3VycmVuY3koKTtcbiAgICAgICAgY2VsbC5jaGFyID0gJyMnO1xuICAgICAgICByZXR1cm4gZ28ucmVmcmVzaCgpO1xuICAgIH1cblxuICAgIGlmIChjZWxsLmNoYXIgPT09ICdOJykge1xuICAgICAgICAvLyBNb3ZlIHNsaWRlciB1cCB1bnRpbCBpdCBoaXRzIHNvbWV0aGluZyBvciBydW5zIG91dCBvZiBzcGFjZVxuICAgICAgICBsZXQgciA9IGdvLnNsaWRlci5yb3cgLSAxO1xuICAgICAgICBjb25zdCBjID0gZ28uc2xpZGVyLmNvbHVtbjtcbiAgICAgICAgd2hpbGUgKHIgPj0gMCAmJiBnby5jZWxsc1tyXVtjXS5pc0NsZWFyKSB7IHItLTsgfVxuICAgICAgICBnby5zbGlkZXIgPSBnby5jZWxsc1tyICsgMV1bY107XG4gICAgICAgIHJldHVybiBnby5yZWZyZXNoKCk7XG4gICAgfVxuICAgIGlmIChjZWxsLmNoYXIgPT09ICdTJykge1xuICAgICAgICAvLyBNb3ZlIHNsaWRlciBkb3duIHVudGlsIGl0IGhpdHMgc29tZXRoaW5nIG9yIHJ1bnMgb3V0IG9mIHNwYWNlXG4gICAgICAgIGxldCByID0gZ28uc2xpZGVyLnJvdyArIDE7XG4gICAgICAgIGNvbnN0IGMgPSBnby5zbGlkZXIuY29sdW1uO1xuICAgICAgICB3aGlsZSAociA8IEdhbWVPbGQuUm93Q291bnQgJiYgZ28uY2VsbHNbcl1bY10uaXNDbGVhcikgeyByKys7IH1cbiAgICAgICAgZ28uc2xpZGVyID0gZ28uY2VsbHNbciAtIDFdW2NdO1xuICAgICAgICByZXR1cm4gZ28ucmVmcmVzaCgpO1xuICAgIH1cbiAgICBpZiAoY2VsbC5jaGFyID09PSAnRScpIHtcbiAgICAgICAgLy8gTW92ZSBzbGlkZXIgbGVmdCB1bnRpbCBpdCBoaXRzIHNvbWV0aGluZyBvciBydW5zIG91dCBvZiBzcGFjZVxuICAgICAgICBjb25zdCByID0gZ28uc2xpZGVyLnJvdztcbiAgICAgICAgbGV0IGMgPSBnby5zbGlkZXIuY29sdW1uICsgMTtcbiAgICAgICAgd2hpbGUgKGMgPCBHYW1lT2xkLkNvbHVtbkNvdW50ICYmIGdvLmNlbGxzW3JdW2NdLmlzQ2xlYXIpIHsgYysrOyB9XG4gICAgICAgIGdvLnNsaWRlciA9IGdvLmNlbGxzW3JdW2MgLSAxXTtcbiAgICAgICAgcmV0dXJuIGdvLnJlZnJlc2goKTtcbiAgICB9XG4gICAgaWYgKGNlbGwuY2hhciA9PT0gJ1cnKSB7XG4gICAgICAgIC8vIE1vdmUgc2xpZGVyIHJpZ2h0IHVudGlsIGl0IGhpdHMgc29tZXRoaW5nIG9yIHJ1bnMgb3V0IG9mIHNwYWNlXG4gICAgICAgIGNvbnN0IHIgPSBnby5zbGlkZXIucm93O1xuICAgICAgICBsZXQgYyA9IGdvLnNsaWRlci5jb2x1bW4gLSAxO1xuICAgICAgICB3aGlsZSAoYyA+PSAwICYmIGdvLmNlbGxzW3JdW2NdLmlzQ2xlYXIpIHsgYy0tOyB9XG4gICAgICAgIGdvLnNsaWRlciA9IGdvLmNlbGxzW3JdW2MgKyAxXTtcbiAgICAgICAgcmV0dXJuIGdvLnJlZnJlc2goKTtcbiAgICB9XG59XG5cbi8qKiBDaGVja3MgaWYgYSBjaGFyIGlzIGludGVyYWN0aXZlIC0tIGkuZS4gc2F0aXNmaWVzIHRoZSBjb25kaXRpb25zIGZvciBpbnRlcmFjdGlvbi4gKi9cbmZ1bmN0aW9uIGlzSW50ZXJhY3RpdmUoY2VsbDogQ2VsbCk6IGJvb2xlYW4ge1xuICAgIGlmICghaXNHYW1lSW50ZXJhY3RhYmxlKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBUaGUgc2xpZGVyJ3MgZGlyZWN0aW9ucyBhcmUgaW50ZXJhY3RpdmUuIChUaGUgc2xpZGVyIGl0c2VsZiBpc24ndClcbiAgICBpZiAoY2VsbC5jaGFyLm1hdGNoKC9bTlNFV10vKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gT3RoZXIgaGlkZGVuIGFuZCBlbXB0eSBjZWxscyBhcmUgbm90IGludGVyYWN0aXZlLlxuICAgIGlmIChjZWxsLmNoYXIgPT09ICcgJyB8fCBjZWxsLmRpc3BsYXkgPT09ICdoaWRkZW4nIHx8IGNlbGwuZGlzcGxheSA9PT0gJ2ZhaW50Jykge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmIChnby5wb3dlckxldmVsIDwgMSAmJiBjZWxsLmlzSW5pdGlhbFNlbnRlbmNlKSB7XG4gICAgICAgIHJldHVybiB0cnVlOyAgLy8gTWF0Y2hlcyB0aGUgaW5pdGlhbCBzZW50ZW5jZS5cbiAgICB9XG4gICAgLy8gTWF5IGV4cGFuZCB0byB0aGUgbGVmdCBhcyBsb25nIGFzIHRoZXJlIGlzIHNwYWNlIGF0IHRoZSBlbmQgb2YgdGhlIGxpbmUuLi5cbiAgICBpZiAoY2VsbC5jaGFyID09PSAnLicpIHtcbiAgICAgICAgLy8gTWF5IGV4cGFuZCBhcyBsb25nIGFzIHRoZXJlIGlzIGVtcHR5IHNwYWNlIGF0IHRoZSBlbmQgb2YgYW55IHBpcGUuXG4gICAgICAgIGxldCByID0gY2VsbC5yb3c7XG4gICAgICAgIGxldCBjID0gY2VsbC5jb2x1bW47XG4gICAgICAgIGlmIChlbGVtZW50c1sncG93ZXItMy1jaGVja2JveCddLmNoZWNrZWQpIHtcbiAgICAgICAgICAgIC8vICBNYXkgcmV0cmFjdCBhcyBsb25nIGFzIHRoZXJlIGlzIGEgZG90IG9uIHRoZSBsZWZ0LlxuICAgICAgICAgICAgcmV0dXJuIGlzSW5NYXBCb3VuZHMociwgYyAtIDEpICYmIChnby5jZWxsc1tyXVtjIC0gMV0uY2hhciA9PT0gJy4nKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBHbyBsZWZ0XG4gICAgICAgIHIgPSBjZWxsLnJvdztcbiAgICAgICAgYyA9IGNlbGwuY29sdW1uIC0gMTtcbiAgICAgICAgd2hpbGUgKGMgPj0gMCkge1xuICAgICAgICAgICAgaWYgKGdvLmNlbGxzW3JdW2NdLmlzQ2xlYXIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChnby5jZWxsc1tyXVtjXS5jaGFyICE9PSAnLicpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGMtLTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoY2VsbC5kaXNwbGF5ID09PSAndW5rbm93bicpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGlmIChjZWxsLmNoYXIgPT09ICckJykge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKGNlbGwuY2hhciA9PT0gJysnKSB7XG4gICAgICAgIC8vIE1heSBleHBhbmQgYXMgbG9uZyBhcyB0aGVyZSBpcyBlbXB0eSBzcGFjZSBhdCB0aGUgZW5kIG9mIGFueSBwaXBlLlxuICAgICAgICBsZXQgciA9IDA7XG4gICAgICAgIGxldCBjID0gMDtcbiAgICAgICAgLy8gR28gbGVmdFxuICAgICAgICByID0gY2VsbC5yb3c7XG4gICAgICAgIGMgPSBjZWxsLmNvbHVtbiAtIDE7XG4gICAgICAgIHdoaWxlIChjID49IDApIHtcbiAgICAgICAgICAgIGlmIChnby5jZWxsc1tyXVtjXS5pc0NsZWFyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZ28uY2VsbHNbcl1bY10uY2hhciAhPT0gJy0nKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjLS07XG4gICAgICAgIH1cbiAgICAgICAgLy8gR28gcmlnaHRcbiAgICAgICAgYyA9IGNlbGwuY29sdW1uICsgMTtcbiAgICAgICAgd2hpbGUgKGMgPCBHYW1lT2xkLkNvbHVtbkNvdW50KSB7XG4gICAgICAgICAgICBpZiAoZ28uY2VsbHNbcl1bY10uaXNDbGVhcikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGdvLmNlbGxzW3JdW2NdLmNoYXIgIT09ICctJykge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYysrO1xuICAgICAgICB9XG4gICAgICAgIC8vIEdvIHVwXG4gICAgICAgIHIgPSBjZWxsLnJvdyAtIDE7XG4gICAgICAgIGMgPSBjZWxsLmNvbHVtbjtcbiAgICAgICAgd2hpbGUgKHIgPj0gMCkge1xuICAgICAgICAgICAgaWYgKGdvLmNlbGxzW3JdW2NdLmlzQ2xlYXIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChnby5jZWxsc1tyXVtjXS5jaGFyICE9PSAnfCcpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHItLTtcbiAgICAgICAgfVxuICAgICAgICAvLyBHbyBkb3duXG4gICAgICAgIHIgPSBjZWxsLnJvdyArIDE7XG4gICAgICAgIHdoaWxlIChyIDwgR2FtZU9sZC5Sb3dDb3VudCkge1xuICAgICAgICAgICAgaWYgKGdvLmNlbGxzW3JdW2NdLmlzQ2xlYXIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChnby5jZWxsc1tyXVtjXS5jaGFyICE9PSAnfCcpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHIrKztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmIChjZWxsLmlzQmVhY29uKSB7XG4gICAgICAgIC8vIFNlZSBsb2dpYyBpbjogdXBkYXRlQmVhY29uc1xuICAgICAgICByZXR1cm4gY2VsbC5iZWFjb25UeXBlID09ICdsZXZlbC1maW5pc2hlZCc7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuLyoqIFdoZXRoZXIgb3Igbm90IHRoZSBjb29yZGluYXRlIGlzIGluIGJvdW5kcyAqL1xuZnVuY3Rpb24gaXNJbk1hcEJvdW5kcyhyOiBudW1iZXIsIGM6IG51bWJlcikge1xuICAgIGlmIChyIDwgMCB8fCByID49IEdhbWVPbGQuUm93Q291bnQgfHwgYyA8IDAgfHwgYyA+PSBHYW1lT2xkLkNvbHVtbkNvdW50KSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbi8qKiBHZXQgdGhlIG5laWdoYm91cnMgb2YgYSBnYW1lLmNlbGxzIGNlbGwgYXMgYW4gb2JqZWN0LiA0IG9mIHRoZW0sIG1heWJlIG51bGwuICovXG5mdW5jdGlvbiBnZXROZWlnaGJvdXJzKGNlbGw6IENlbGwpIHtcbiAgICBjb25zdCBsZWZ0ID0gaXNJbk1hcEJvdW5kcyhjZWxsLnJvdywgY2VsbC5jb2x1bW4gLSAxKSA/IGdvLmNlbGxzW2NlbGwucm93XVtjZWxsLmNvbHVtbiAtIDFdIDogbnVsbDtcbiAgICBjb25zdCByaWdodCA9IGlzSW5NYXBCb3VuZHMoY2VsbC5yb3csIGNlbGwuY29sdW1uICsgMSkgPyBnby5jZWxsc1tjZWxsLnJvd11bY2VsbC5jb2x1bW4gKyAxXSA6IG51bGw7XG4gICAgY29uc3QgZG93biA9IGlzSW5NYXBCb3VuZHMoY2VsbC5yb3cgKyAxLCBjZWxsLmNvbHVtbikgPyBnby5jZWxsc1tjZWxsLnJvdyArIDFdW2NlbGwuY29sdW1uXSA6IG51bGw7XG4gICAgY29uc3QgdXAgPSBpc0luTWFwQm91bmRzKGNlbGwucm93IC0gMSwgY2VsbC5jb2x1bW4pID8gZ28uY2VsbHNbY2VsbC5yb3cgLSAxXVtjZWxsLmNvbHVtbl0gOiBudWxsO1xuICAgIHJldHVybiB7XG4gICAgICAgIGxlZnQsIHJpZ2h0LCB1cCwgZG93bixcbiAgICB9O1xufVxuXG4vKipcbiAqIEdldCBhbiBhcnJheSB0aGUgbmVpZ2hib3VycyBvZiBhIGdhbWUuY2VsbHMgY2VsbC4gVXAgdG8gZm91ciBvZiB0aGVtLlxuICpcbiAqIEBwYXJhbSBjZWxsIG1pZGRsZSBjZWxsIHRvIGdldCB0aGUgbmVpZ2hib3VycyBvZlxuICogQHBhcmFtIGRpc3QgZGlzdGFuY2UgZnJvbSB0aGUgbWlkZGxlIGNlbGwgKGRlZmF1bHQgMSlcbiAqL1xuZnVuY3Rpb24gZ2V0TmVpZ2hib3Vyc0FzQXJyYXkoY2VsbDogQ2VsbCwgZGlzdCA9IDEpIHtcbiAgICBjb25zdCBsZWZ0ID0gaXNJbk1hcEJvdW5kcyhjZWxsLnJvdywgY2VsbC5jb2x1bW4gLSBkaXN0KSA/IGdvLmNlbGxzW2NlbGwucm93XVtjZWxsLmNvbHVtbiAtIGRpc3RdIDogbnVsbDtcbiAgICBjb25zdCByaWdodCA9IGlzSW5NYXBCb3VuZHMoY2VsbC5yb3csIGNlbGwuY29sdW1uICsgZGlzdCkgPyBnby5jZWxsc1tjZWxsLnJvd11bY2VsbC5jb2x1bW4gKyBkaXN0XSA6IG51bGw7XG4gICAgY29uc3QgZG93biA9IGlzSW5NYXBCb3VuZHMoY2VsbC5yb3cgKyBkaXN0LCBjZWxsLmNvbHVtbikgPyBnby5jZWxsc1tjZWxsLnJvdyArIGRpc3RdW2NlbGwuY29sdW1uXSA6IG51bGw7XG4gICAgY29uc3QgdXAgPSBpc0luTWFwQm91bmRzKGNlbGwucm93IC0gZGlzdCwgY2VsbC5jb2x1bW4pID8gZ28uY2VsbHNbY2VsbC5yb3cgLSBkaXN0XVtjZWxsLmNvbHVtbl0gOiBudWxsO1xuICAgIGNvbnN0IGFycjogQ2VsbFtdID0gW107XG4gICAgaWYgKGxlZnQpIHsgYXJyLnB1c2gobGVmdCk7IH1cbiAgICBpZiAocmlnaHQpIHsgYXJyLnB1c2gocmlnaHQpOyB9XG4gICAgaWYgKHVwKSB7IGFyci5wdXNoKHVwKTsgfVxuICAgIGlmIChkb3duKSB7IGFyci5wdXNoKGRvd24pOyB9XG4gICAgcmV0dXJuIGFycjtcbn1cblxuLyoqXG4gKiBEZWFjdGl2YXRlIGFsbCB0aGUgYmVhY29ucyBvbiB0aGUgZ2FtZS5jZWxscyB3aXRoIG51bWJlciBlcXVhbCB0byBiZWFjb25OdW0uXG4gKiBBbmQgcmV2ZWFsIGFsbCB0aGUgYmVhY29ucyBvbiB0aGUgZ2FtZS5jZWxscyB3aXRoIG51bWJlciBlcXVhbCB0byBiZWFjb25OdW0gKyAxLlxuICovXG5mdW5jdGlvbiBkZXN0cm95QW5kUmV2ZWFsQmVhY29ucyhiZWFjb25OdW06IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHRvRGVzdHJveSA9IFN0cmluZyhiZWFjb25OdW0pO1xuICAgIGNvbnN0IHRvUmV2ZWFsID0gU3RyaW5nKGJlYWNvbk51bSArIDEpO1xuICAgIGZvciAoY29uc3Qgcm93IG9mIGdvLmNlbGxzKSB7XG4gICAgICAgIGZvciAoY29uc3QgY2VsbCBvZiByb3cpIHtcbiAgICAgICAgICAgIGlmIChjZWxsLmNoYXIgPT09IHRvUmV2ZWFsKSB7XG4gICAgICAgICAgICAgICAgY2VsbC5kaXNwbGF5ID0gJ3Zpc2libGUnO1xuICAgICAgICAgICAgICAgIGNlbGwuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKENsYXNzTmFtZXMuRmFpbnQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjZWxsLmNoYXIgPT09IHRvRGVzdHJveSkge1xuICAgICAgICAgICAgICAgIGNlbGwuY2hhciA9ICcgJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuLyoqIFBvd2VyOiByZW1vdmUgYWxsIHBpcGVzIGZyb20gdGhlIGdhbWUuY2VsbHMgKi9cbmZ1bmN0aW9uIHJlbW92ZUFsbFBpcGVzKCk6IHZvaWQge1xuICAgIGlmIChnby5wb3dlckxldmVsIDwgMSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdNdXN0IGhhdmUgcG93ZXIgbGV2ZWwgYXQgbGVhc3QgMScpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qgcm93IG9mIGdvLmNlbGxzKSB7XG4gICAgICAgIGZvciAoY29uc3QgY2VsbCBvZiByb3cpIHtcbiAgICAgICAgICAgIGlmIChjZWxsLmNoYXIgPT09ICctJyB8fCBjZWxsLmNoYXIgPT09ICd8Jykge1xuICAgICAgICAgICAgICAgIGNlbGwuY2hhciA9ICcgJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBnby5yZWZyZXNoKCk7XG59XG5cbi8qKiBBZGQgMSB0byBjdXJyZW5jeS4gVXBkYXRlcyB0aGUgdHJvcGhpZXMuICovXG5mdW5jdGlvbiBhZGRDdXJyZW5jeSgpIHtcbiAgICBlbGVtZW50c1sndHJvcGh5LWNvbnRhaW5lciddLmNsYXNzTGlzdC5yZW1vdmUoQ2xhc3NOYW1lcy5JbnZpc2libGUpO1xuICAgIGN1cnJlbmN5Q29sbGVjdGVkICs9IDEwMDtcbiAgICBlbGVtZW50c1sndHJvcGh5LW1vbmV5J10udGV4dENvbnRlbnQgPSBgTW9uZXk6ICQke2N1cnJlbmN5Q29sbGVjdGVkfWA7XG5cbiAgICBpZiAoVFJPUEhJRVNbbmV4dFRyb3BoeV0uY29zdCA8PSBjdXJyZW5jeUNvbGxlY3RlZCkge1xuICAgICAgICAvLyBDYW4gZGlzcGxheSB0aGUgbmV4dCB0cm9waHlcbiAgICAgICAgZWxlbWVudHNbJ3Ryb3BoeS1jYXNlJ10uYXBwZW5kQ2hpbGQodHJvcGh5VG9IdG1sKFRST1BISUVTW25leHRUcm9waHldLmRlc2lnbikpO1xuICAgICAgICBlbGVtZW50c1sndHJvcGh5LWNhc2UnXS5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJyB9KTtcbiAgICAgICAgbmV4dFRyb3BoeSsrO1xuXG4gICAgICAgIGVsZW1lbnRzWyd0cm9waHktbmV4dCddLmlubmVySFRNTCA9IG5leHRUcm9waHkgPCBUUk9QSElFUy5sZW5ndGggXG4gICAgICAgICAgICA/IGBcXG5cXG5cXG4gTmV4dDogJCR7VFJPUEhJRVNbbmV4dFRyb3BoeV0uY29zdH0gXFxuXFxuXFxuYCA6IGBcXG5cXG5cXG4gRk9VTkQgXFxuIFRIRU0gXFxuIEFMTCEgXFxuXFxuXFxuYDtcbiAgICB9XG4gICAgY2hlY2tDb21wbGV0aW9uKCk7XG59XG5cbmZ1bmN0aW9uIHRyb3BoeVRvSHRtbChkZXNpZ246IHN0cmluZ1tdKTogSFRNTFByZUVsZW1lbnQge1xuICAgIGNvbnN0IHByZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ByZScpO1xuICAgIHByZS5pbm5lckhUTUwgPSBkZXNpZ24uam9pbignXFxuJyk7XG4gICAgcHJlLmNsYXNzTGlzdC5hZGQoJ3Ryb3BoeScpO1xuICAgIHJldHVybiBwcmU7XG59XG5cbi8qKiBDaGVjayBjb21wbGV0aW9uaXN0OiBoYXZlIG1heCBwb3dlciBsZXZlbCBhbmQgYWxsIHRyb3BoaWVzICovXG5mdW5jdGlvbiBjaGVja0NvbXBsZXRpb24oKSB7XG4gICAgaWYgKGdvLnBvd2VyTGV2ZWwgPT09IDZcbiAgICAgICAgJiYgY3VycmVuY3lDb2xsZWN0ZWQgPT09IE1BWF9DVVJSRU5DWSkge1xuICAgICAgICBjb25zdCBwID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbXBsZXRpb25pc3QnKTtcbiAgICAgICAgaWYgKHAudGV4dENvbnRlbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHAudGV4dENvbnRlbnQgPSAnMTAwJSBDb21wbGV0aW9uISBZb3Ugd2luISBUaGFua3MgZm9yIHBsYXlpbmcuJztcbiAgICAgICAgcC5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJyB9KTtcbiAgICB9XG59XG5cbmdvLnJlZnJlc2goKTtcblxuZWxlbWVudHNbJ21haW4tY29udGFpbmVyJ10uc3R5bGUub3BhY2l0eSA9ICcwJztcbmdvLnJlZnJlc2goKTtcblxuLy8gUGFnZSBzdGFydHMgYmxhbmtcbmxldCBwYWdlT3BhY2l0eU11bHRpcGxlciA9IDA7XG5cbi8qKiBNYXN0ZXIgc3dpdGNoIHRvIGNvbnRyb2wgaWYgdGhlIHByZSBjYW4gYmUgaW50ZXJhY3RlZCB3aXRoLiAqL1xuZnVuY3Rpb24gc2V0R2FtZUludGVyYWN0YWJsZSh2YWx1ZTogYm9vbGVhbikge1xuICAgIGlzR2FtZUludGVyYWN0YWJsZSA9IHZhbHVlO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVDbGljaygpIHtcbiAgICAvLyBJbmNyZWFzZSBvcGFjaXR5IHVudGlsIDEsIHRoZW4gcmVtb3ZlIHRoZSBldmVudFxuICAgIHBhZ2VPcGFjaXR5TXVsdGlwbGVyICs9IDE7XG4gICAgaWYgKHBhZ2VPcGFjaXR5TXVsdGlwbGVyIDwgMTApIHtcbiAgICAgICAgLy8gTm90IHVzaW5nIGZsb2F0cyBoZXJlIGR1ZSB0byBmbG9hdGluZyBwb2ludCBpbXByZWNpc2lvblxuICAgICAgICBlbGVtZW50c1snbWFpbi1jb250YWluZXInXS5zdHlsZS5vcGFjaXR5ID0gYC4ke3BhZ2VPcGFjaXR5TXVsdGlwbGVyfWA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZWxlbWVudHNbJ21haW4tY29udGFpbmVyJ10uc3R5bGUub3BhY2l0eSA9ICcxJztcbiAgICAgICAgZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoYW5kbGVDbGljayk7XG4gICAgICAgIHNldEdhbWVJbnRlcmFjdGFibGUodHJ1ZSk7XG4gICAgICAgIGdvLnJlZnJlc2goKTtcbiAgICB9XG59XG5cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaGFuZGxlQ2xpY2spO1xuXG5lbGVtZW50c1sncG93ZXItMi1idXR0b24nXS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICByZW1vdmVBbGxQaXBlcygpO1xufSk7XG5lbGVtZW50c1sncG93ZXItMy1jaGVja2JveCddLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+IHtcbiAgICBnby5yZWZyZXNoKCk7XG59KTsiLCIvKiogVGhlIHdvcmxkIG1hcC4gRXZlcnl0aGluZyBzdGFydHMgaGlkZGVuIGV4Y2VwdCBmb3IgdGhlIGZpcnN0IHNlbnRlbmNlLiAqL1xuZXhwb3J0IGNvbnN0IE1BUF9TQ0hFTUFUSUMgPSBbXG4gICAgJ0AgICAgICAgICAgIDAgNCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICMgICQgKyA1ICcsICAvLyBPbmx5IHRoZSBzbGlkZXIgc2hvdWxkIGJlIGFibGUgdG8gcmVhY2ggdGhpcyA1XG4gICAgJyAgICAgICAgICA0ICAgICMgICAgICAgICAgICAgMCAgICAgICAgICAuICAgICAjIyAjICAgIycsICAvLyBMZWZ0bW9zdCBuZWVkcyB0byBiZSBibG9ja2VkXG4gICAgJyAgICAgICAgICAgICAgICsgICAgICAgICAgICAgICsgICAgICAgICAgNiAkICMgICAgICAjICcsICAvLyBOZWVkIC4gYW5kIHNsaWRlciB0byBibG9jayBtaWRkbGUgKyB3aGlsZSBpdCBleHRlbmRzIHRvIDUuXG4gICAgJyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAgICMgICAgICAgICcsXG4gICAgJyMgKyBUaGlzIHBhZ2UgaXMgaW50ZW50aW9uYWxseSBsZWZ0IGJsYW5rLiAgICAgICAgICAgICcsICAvLyBOZWVkIHRvIGdldCBzbGlkZXIgdG8gYmVsb3cgdGhlIDAuXG4gICAgJyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjICAgICAgICcsXG4gICAgJzQgICAgICAgICAgKyAgICAgICAgICAgICAgICAgKyAgICAgICAgICAgICsgICAgNSAgICAgICcsICAvLyBMZWZ0bW9zdCArOiBuZWVkIHVwIDIsIGRvd24gMy4gRXh0ZW5kIDMgbW9yZS5cbiAgICAnICAgICAgICAgICAgICAgIyAjICAgICAgICAgICMjICAgICAgICAgICAgICAgICAgICAgICAgJyxcbiAgICAnIyArICAgICAxICAgICArICAgIyAgICAgICAgICAgIDAgICAgICAgICAgICAgIyAjICAgICAgJywgIC8vIDJuZCArOiBtdXN0IGV4cGFuZCBleGFjdGx5IHR3aWNlIHRvIHJlYWNoIDQuXG4gICAgJyAgICAgICAgICAgICAgICAgICAgICAgICAgICMrICAgICAgICAgICAgICAgICAjICAgICAgICcsICAvLyBNaWRkbGUgKyBpcyBtb3JlIGRpc2NvdmVyYWJsZSBkdWUgdG8gI1xuICAgICczICAgICAgMiAgICAgLiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICMnLFxuICAgICcgICAgICAgICAgICAjICAgICArICAgIyAgICAgICAgICAgICAgICAgICAgICAgICAgICMgICAnLFxuICAgICcgICMgICAgICMgNCAgICArICAgICMgICMgICAgNSAgICAgICAgICAgICAgICAgICAgICAgICAnLFxuICAgICcgICAgICAgICAgICAwICMgICAgMiAgICAgICAgICAgICAgICAgICAgICAkICMgICAgICAgICMnLFxuICAgICcgICAgICAgICAgIyAgICAgICsgICAgICAjICMgNiAjIyMgIyQjIyAjIyAgICAgICAgIyAjICMnLFxuICAgICcgICAgICMgJCAjICAgICAgICAjICAgMyAgIyAjICMgICAwICAgICMgICMgJCAjIyMjICAgNiAnLFxuICAgICcgICAgICAgICAgICMgICAgICMgIyAjICAjICAgIyAgICAgICAgICAgICAgICAgICAgICQgICAnLFxuICAgICcgICAgICAgIyAgICAgICAgMyAkICQgIyMgICAgICsgICAgICAgICMgICAgKyAgICAgICAgICAnLFxuICAgICcgIyAgICAgICAgICAgICAjICMgICAwICAgKyAgICAgIyAgICAgICAgICAgICAgICAgICAgNiAnLFxuICAgICc1ICMjIyMjICAjICMjIyMgIyAgICAgICAgICAgICAgICArICAgIDYgICAjICAgICAgICAgICAnLFxuICAgICcgICAgICAgICAgICMgICAgICAgICArICAgICAgIDAgICAgICAgICAgICAgICAgICAjIyAkICAnLFxuICAgICcjIDYgICAgICsgICA1IDAgIyAgICAgIyAgICAjICAgICAgICAgICAjICAgICAgICAgICAgICAnLFxuXTtcblxuaWYgKE1BUF9TQ0hFTUFUSUMucmVkdWNlKChzdW0sIHJvdykgPT4gc3VtICsgQXJyYXkuZnJvbShyb3cpLmZpbHRlcihjID0+IGMgPT0gJyQnKS5sZW5ndGgsIDApICE9IDEwKSB7XG4gICAgY29uc29sZS5sb2coJ2luY29ycmVjdCBudW1iZXIgb2YgbW9uZXknKTtcbn1cblxuLy8gTmVlZCB0byBlc2NhcGUgdGhlIGJhY2tzbGFzaGVzIHRob3VnaFxuZXhwb3J0IGNvbnN0IFRST1BISUVTID0gW3tcbiAgICBkZXNpZ246IFtcbiAgICAgICAgJyAgICAgJyxcbiAgICAgICAgJyAgICAgJyxcbiAgICAgICAgJyAgICAgJyxcbiAgICAgICAgJyAgICAgJyxcbiAgICAgICAgJyAgICAgJyxcbiAgICAgICAgJyAgXyAgJyxcbiAgICAgICAgJyB7MX0gJyxcbiAgICAgICAgJyAgXCIgICcsXG4gICAgXSxcbiAgICBjb3N0OiAxMDAsXG59LCB7XG4gICAgZGVzaWduOiBbXG4gICAgICAgICcgICAgICcsXG4gICAgICAgICcgICAgICcsXG4gICAgICAgICcgICAgICcsXG4gICAgICAgICcgICAgICcsXG4gICAgICAgICcgIF8gICcsXG4gICAgICAgICcgLz1cXFxcICcsXG4gICAgICAgICcgXFxcXFwiLyAnLFxuICAgICAgICAnIC9fXFxcXCAnLFxuICAgIF0sXG4gICAgY29zdDogMjAwLFxufSwge1xuICAgIGRlc2lnbjogW1xuICAgICAgICAnICAgICAgICcsXG4gICAgICAgICcgICAgICAgJyxcbiAgICAgICAgJyAgICAgICAnLFxuICAgICAgICAnICAvLVxcXFwgICcsXG4gICAgICAgICcgW1xcXFxfL10gJyxcbiAgICAgICAgJyAgXFxcXCAvICAnLFxuICAgICAgICAnICB8NHwgICcsXG4gICAgICAgICcgIFtfXSAgJyxcbiAgICBdLFxuICAgIGNvc3Q6IDQwMCxcbn0sIHtcbiAgICBkZXNpZ246IFtcbiAgICAgICAgJyAgICAgICAgICAnLFxuICAgICAgICAnICAgICAgICAgICcsXG4gICAgICAgICcgICBfX19fICAgJyxcbiAgICAgICAgJyAvfCAuLiB8XFxcXCAnLFxuICAgICAgICAnIFxcXFx8IC4uIHwvICcsXG4gICAgICAgICcgIFxcXFwgICAgLyAgJyxcbiAgICAgICAgJyAgIHxfX3wgICAnLFxuICAgICAgICAnICAvX19fX1xcXFwgICcsXG4gICAgXSxcbiAgICBjb3N0OiA2MDAsXG59LCB7XG4gICAgZGVzaWduOiBbXG4gICAgICAgICcgICAgIF9fICAgICAnLFxuICAgICAgICAnICAgL2AgIFxcXFxcXFxcICAgJyxcbiAgICAgICAgJyAgX1xcXFxfX18vL18gICcsXG4gICAgICAgICcgfCB8IExEIHwgfCAnLFxuICAgICAgICAnICBcXFxcfCA0NSB8LyAgJyxcbiAgICAgICAgJyAgIFxcXFwgICAgLyAgICcsXG4gICAgICAgICcgICAgfF9ffCAgICAnLFxuICAgICAgICAnICAgL19fX19cXFxcICAgJyxcbiAgICBdLFxuICAgIGNvc3Q6IDgwMCxcbn0sIHtcbiAgICBkZXNpZ246IFtcbiAgICAgICAgJyAgIC9gYGBgXFxcXCAgICcsXG4gICAgICAgICcgIC8gIC9cXFxcICBcXFxcICAnLFxuICAgICAgICAnICBcXFxcICBcXFxcLyAgLyAgJyxcbiAgICAgICAgJyAgIFxcXFwgIFxcXFwgLyAgICcsXG4gICAgICAgICcgXFxcXC0vXFxcXCAgXFxcXFxcXFwtLyAnLFxuICAgICAgICAnIC8tXFxcXCBfXyAvLVxcXFwgJyxcbiAgICAgICAgJyAgICB8X198ICAgICcsXG4gICAgICAgICcgICAvX19fX1xcXFwgICAnLFxuICAgIF0sXG4gICAgY29zdDogMTAwMCxcbn1dO1xuICBcbi8vIFRyb3BoaWVzIG11c3QgaGF2ZSBjb3JyZWN0IGhlaWdodFxuZm9yIChjb25zdCB0IG9mIFRST1BISUVTKSB7XG4gICAgaWYgKHQuZGVzaWduLmxlbmd0aCAhPT0gOCkge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdUIGhhcyBpbmNvcnJlY3QgaGVpZ2h0JywgdCk7XG4gICAgfVxufVxuIiwiXG5leHBvcnQgZnVuY3Rpb24gcmFuZ2Uoc3RhcnQ6IG51bWJlciwgc3RvcD86IG51bWJlciwgc3RlcD86IG51bWJlcikge1xuICAgIGlmICh0eXBlb2Ygc3RvcCA9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAvLyBvbmUgcGFyYW0gZGVmaW5lZFxuICAgICAgICBzdG9wID0gc3RhcnQ7XG4gICAgICAgIHN0YXJ0ID0gMDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBzdGVwID09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHN0ZXAgPSAxO1xuICAgIH1cbiAgICBpZiAoKHN0ZXAgPiAwICYmIHN0YXJ0ID49IHN0b3ApIHx8IChzdGVwIDwgMCAmJiBzdGFydCA8PSBzdG9wKSkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gW107XG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBzdGVwID4gMCA/IGkgPCBzdG9wIDogaSA+IHN0b3A7IGkgKz0gc3RlcCkge1xuICAgICAgICByZXN1bHQucHVzaChpKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG4iXSwic291cmNlUm9vdCI6IiJ9