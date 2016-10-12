function selectionManager() {
    'use strict';
    
    var Manager = function () {};
    var singleton = this;
    var searchStatusTypes = {
        IN_RANGE: 0,
        LESS: 1,
        GREATER: 2
    };
    this.modifierTypes = {
        SINGLE: 1,
        RANGE: 2
    };
    this.createManager = (dataArray) => {
        var instance = new Manager();
        instance.lastSelected;
        instance.items = dataArray;
        instance.clearSelected();
        return instance;
    };
    Manager.prototype.clearSelected = function () {
        this.selected = [];
    };
    Manager.prototype.select = function (index, modifier) {
        // naked click empty's selections and adds index to selected
        if (!modifier || !this.lastSelected || this.selected.length === 0) {
            this.clearSelected();
            insertItem.call(this, index, 0);
            return;
        }
        // single click modifier (ctrl) selects/deselects item without clearing selections
        if (modifier === singleton.modifierTypes.SINGLE) {
            var result = binarySearch.call(this, index);
            switch (result.status) {
            case searchStatusTypes.IN_RANGE:
                removeItem.call(this, index, result.m);
                break;
            case searchStatusTypes.LESS:
                insertItem.call(this, index, result.m);
                break;
            case searchStatusTypes.GREATER:
                insertItem.call(this, index, result.m + 1);
            }
            return;
        }
        // range click modifier (shift) selects ranges of items
        if (modifier === singleton.modifierTypes.RANGE) {
            if (this.lastSelected.length === 2) {
                removeRange.call(this);
                var result = binarySearch.call(this, this.lastSelected[0].value);
                insertItem.call(this, this.lastSelected[0].value, result.status === searchStatusTypes.GREATER ? ++result.m : result.m);
            }
            insertRange.call(this, index);
        }
    };
    Manager.prototype.getSelected = function () {
        var instance = this;
        return _.flatMap(this.selected, function (i) {
            if (i.length === 1) {
                return instance.items[i];
            }
            var range = [];
            iterateThroughRange(i, function (index) {
                range.push(instance.items[index]);
            });
            return range;
        });
    };
    Manager.prototype.getLastSelected = function () {
        var instance = this;
        if (!this.lastSelected) {
            return [];
        }
        if (this.lastSelected.length === 1) {
            return [this.items[this.lastSelected[0].value]];
        }
        var range = [];
        iterateThroughRange(_.map(this.lastSelected, function (x) {
            return x.value;
        }), function (i) {
            range.push(instance.items[i]);
        });
        return range;
    };
    Manager.prototype.isSelected = function (index) {
        return binarySearch.call(this, index)
            .status === searchStatusTypes.IN_RANGE;
    };

    function insertItem(item, index) {
        this.selected.splice(index, 0, [item]);
        storeSelected.call(this, item, index);
    }

    function insertRange(item) {
        var temp, deleteCount, newRange, start, end,
            firstIndex = this.lastSelected[0].index,
            result = binarySearch.call(this, item);
        switch (result.status) {
        case searchStatusTypes.IN_RANGE:
            if (firstIndex === result.m) {
                // selected range is within a previously selected range so no need to change anything
                start = firstIndex;
                newRange = this.selected[firstIndex];
                break;
            }
            if (firstIndex < result.m) {
                start = firstIndex;
                end = result.m;
            } else {
                end = firstIndex;
                start = result.m;
            }
            temp = this.selected[end];
            deleteCount = end - start + 1;
            newRange = [this.selected[start][0], temp[1] ? temp[1] : temp[0]];
            this.selected.splice(start, deleteCount, newRange);
            break;
        case searchStatusTypes.GREATER:
            result.m++;
        case searchStatusTypes.LESS:
            if (firstIndex === result.m) {
                if (this.selected[firstIndex].length === 1) {
                    if (result.status === searchStatusTypes.GREATER) {
                        this.selected[firstIndex].push(item);
                    } else {
                        this.selected[firstIndex].unshift(item);
                    }
                } else {
                    if (result.status === searchStatusTypes.GREATER) {
                        this.selected[firstIndex][1] = item;
                    } else {
                        this.selected[firstIndex][0] = item;
                    }
                }
                start = firstIndex;
                newRange = this.selected[firstIndex];
                break;
            } else if (firstIndex < result.m) {
                start = firstIndex;
                deleteCount = result.m - firstIndex;
                newRange = [this.selected[firstIndex][0], item];
            } else {
                start = result.m;
                deleteCount = firstIndex - result.m + 1;
                temp = this.selected[firstIndex];
                newRange = [item, temp[1] ? temp[1] : temp[0]];
            }
            this.selected.splice(start, deleteCount, newRange);
        }
        var lastSelectedResult = binarySearch.call(this, this.lastSelected[0].value);
        switch (lastSelectedResult.status) {
        case searchStatusTypes.LESS:
            newRange[lastSelectedResult.m > start ? 1 : 0] = this.lastSelected[0].value;
            break;
        case searchStatusTypes.GREATER:
            newRange[lastSelectedResult.m === start ? 1 : 0] = this.lastSelected[0].value;
            break;
        }
        // Adds range so it can be backed out if another range is selected next
        this.lastSelected.push({
            value: item,
            index: start
        });
        // Makes sure first item in range has it's updated index
        this.lastSelected[0].index = start;
    }

    function removeItem(item, index) {
        if (this.selected[index].length === 1) {
            // single
            this.selected.splice(index, 1);
        } else {
            // range
            if (this.selected[index][0] === item) {
                this.selected[index][0]++;
            } else if (this.selected[index][1] === item) {
                this.selected[index][1]--;
            } else {
                this.selected.splice(index + 1, 0, _.uniq([item + 1, this.selected[index][1]]));
                this.selected[index][1] = item - 1;
            }
            // remove duplicates in case the range was consecutive numbers i.e [1,2] or [44,45]
            this.selected[index] = _.uniq(this.selected[index]);
        }
        storeSelected.call(this, item, index);
    }

    function removeRange() {
        var start = this.lastSelected[0].index,
            high = this.lastSelected[0].value,
            low = this.lastSelected[1].value;
        if (high < low) {
            high = low;
            low = this.lastSelected[0].value;
        }
        if (this.selected[start][0] === low && this.selected[start][1] === high) {
            // this range is not a subset of another range so just remove it
            this.selected.splice(start, 1);
        } else if (this.selected[start][0] === low) {
            // this range starts at the beginning of a larger range so just change the larger range's start value to 1 greater than this range's end value
            this.selected[start] = [high + 1, this.selected[start][1]];
        } else if (this.selected[start][1] === high) {
            // this range ends at the end of a larger range so just change the larger range's end value to 1 less than this range's start value
            this.selected[start] = [this.selected[start][0], low - 1];
        } else {
            // this range is enclosed by a larger range so
            this.selected.splice(start + 1, 0, _.uniq([high + 1, this.selected[start][1]]));
            this.selected[start][1] = low - 1;
            this.selected[start] = _.uniq(this.selected[start]);
        }
        this.lastSelected.pop();
    }

    function binarySearch(value) {
        var l = 0,
            r = this.selected.length - 1,
            m = 0,
            status = searchStatusTypes.LESS;
        while (l <= r) {
            m = (l + r) / 2 | 0;
            if (value === this.selected[m][0]) {
                status = searchStatusTypes.IN_RANGE;
                break;
            }
            if (value < this.selected[m][0]) {
                r = m - 1;
                status = searchStatusTypes.LESS;
                continue;
            }
            if (value > this.selected[m][0]) {
                if (this.selected[m][1] && value <= this.selected[m][1]) {
                    status = searchStatusTypes.IN_RANGE;
                    break;
                }
                l = m + 1;
                status = searchStatusTypes.GREATER;
            }
        }
        return {
            m: m,
            status: status
        };
    }

    function storeSelected(value, index) {
        this.lastSelected = [{
            value: value,
            index: index
        }];
    }

    function iterateThroughRange(range, fn) {
        var high = range[0],
            low = range[1];
        if (high < low) {
            high = low;
            low = range[0];
        }
        var x = low,
            y = high + 1;
        do {
            fn(x++);
        } while (x < y);
    }
}
