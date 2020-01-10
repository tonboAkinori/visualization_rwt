var dataView = new Slick.Data.DataView({ inlineFilters: true });

$(function () {

  var ros = new ROSLIB.Ros();

  var topicTypeDetail = {};
  var info = {};
  var topicId = 0;

  var subscribingMap = {};
  var subscribingValueMap = {};

  var checkboxSelector = new Slick.CheckboxSelectColumn({
    cssClass: 'slick-cell-checkboxsel',
    hideInColumnTitleRow: true,

  });

  var checkboxColumnDef = checkboxSelector.getColumnDefinition();
  checkboxColumnDef.formatter = checkboxCustomFormatter;

  var columns = [
    checkboxColumnDef,
    { id: 'topic', name: 'Topic', field: 'topic', width: 200, minWidth: 20, maxWidth: 300, sortable: true, formatter: treeFormatter },
    { id: 'type', name: 'Type', field: 'type', width: 260, minWidth: 20, maxWidth: 900, sortable: true },
    { id: 'bandwidth', name: 'Bandwidth', field: 'bandwidth', width: 50, minWidth: 20, maxWidth: 300, sortable: true },
    { id: 'hz', name: 'Hz', field: 'hz', width: 50, minWidth: 20, maxWidth: 300, sortable: true },
    { id: 'value', name: 'Value', field: 'value', width: 100, minWidth: 20, maxWidth: 300, sortable: true },
  ];
  var data = [];
  var grid = new Slick.Grid('#myGrid', dataView, columns);

  var topicDetailMap = {}; // key: topic name, value: message detail

  ////////////////////////////////////////
  // common

  // initialize screen
  function initScreen() {
    // common
    ros.autoConnect();

    // for grid
    dataView.beginUpdate();
    dataView.setItems(data);
    dataView.setFilter(myFilter);
    dataView.endUpdate();

    // draw grid
    getTopics();
  }


  function checkboxCustomFormatter(row, cell, value, columnDef, dataContext) {
    var idx = dataView.getIdxById(dataContext.id);
    if (data[idx] && data[idx].parent === null && !(dataContext._checked)) {
      // return checkboxDefaultFormatter(row, cell, value, columnDef, dataContext);
      return '<input type="checkbox" class="checkbox"></span>';
    } else if (data[idx] && data[idx].parent === null) {
      return '<input type="checkbox" class="checkbox" checked="checked"></span>';
    }

    return '';
  }

  function treeFormatter(row, cell, value, columnDef, dataContext) {
    if (value === null || value === undefined || dataContext === undefined) { return ''; }

    value = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var spacer = '<span style="display:inline-block;height:1px;width:' + (15 * dataContext['indent']) + 'px"></span>';
    var idx = dataView.getIdxById(dataContext.id);
    if (data[idx + 1] && data[idx + 1].indent > data[idx].indent) {
      if (dataContext._collapsed) {
        return spacer + '<span class="toggle expand"></span>' + value;
      } else {
        return spacer + '<span class="toggle collapse"></span>' + value;
      }
    } else {
      return spacer + '<span class="toggle leaf"></span>' + value;
    }
  }

  function myFilter(item) {
    if (item.parent !== null) {
      var parent = dataView.getItemById(item.parent);

      while (parent) {
        if (parent._collapsed) {
          return false;
        }

        parent = dataView.getItemById(parent.parent);
      }
    }
    return true;
  }

  function decodeTypeDefs(type_defs, root) {
    // It calls itself recursively to resolve type definition
    // using hint_defs.
    var decodeTypeDefsRec = function (theType, parent, hint_defs) {
      var typeList = [];
      var sub_type;

      // _.each(theType.fieldarraylen, function (value, index) {
      for (var i = 0; i < theType.fieldnames.length; i++) {
        var arrayLen = theType.fieldarraylen[i];
        var fieldName = theType.fieldnames[i];
        var fieldType = theType.fieldtypes[i];

        topicId++;
        var item = {
          id: topicId,
          topic: fieldName,
          type: fieldType + ((arrayLen === -1) ? '' : '[]'),
          bandwidth: undefined,
          hz: undefined,
          value: undefined,
          parent: parent.id,
          indent: parent.indent + 1,
          root: root.topic,
          path: parent.path + '.' + fieldName,
          subType: true,
          _collapsed: true,
        };
        typeList.push(item);

        // lookup the name
        sub_type = undefined;
        for (var j = 0; j < hint_defs.length; j++) {
          if (hint_defs[j].type.toString() === fieldType.toString()) {
            sub_type = hint_defs[j];
            break;
          }
        }
        if (sub_type) {
          var sub_type_result = decodeTypeDefsRec(sub_type, item, hint_defs);
          typeList = typeList.concat(sub_type_result);
        } else {
          item.subType = false;
          // var detailList = subscribingValueMap[root.topic];
          // _.each(detailList, function (detail, type) {
          //   if (item.type === type) {
          //     item.value = detail;
          //   }
          // });
        }
      }

      return typeList;
    }; // end of decodeTypeDefsRec

    return decodeTypeDefsRec(type_defs[0], root, type_defs);
  }

  function getTopics() {
    ros.getTopics(function (topicInfo) {
      console.log(topicInfo);

      var promises = [];

      _.each(topicInfo.topics, function (topicName, index) {
        var topicType = topicInfo.types[index];

        var promise = getMessageDetailsAsync(
          topicType,
          function (result) {
            // console.log(result);
            topicDetailMap[topicName] = {
              topicType: topicType,
              detail: result
            };
          },
          function (mes) {
            console.log(mes);
          }
        );
        promises.push(promise);
      });

      // TODO: bandwidth, hz を取得する

      $.when.apply(null, promises).done(function () {
        // format type information
        var fieldList = [];

        _.each(topicDetailMap, function (details, topicName) {
          topicId++;
          var parent = {
            id: topicId,
            topic: topicName,
            type: details.topicType,
            bandwidth: undefined,
            hz: undefined,
            value: undefined,
            parent: null,
            indent: 0,
            root: topicName,
            path: topicName,
            subType: true,
            _collapsed: true,
            _checked: false,
          };

          fieldList.push(parent);

          var decoded = decodeTypeDefs(details.detail, parent);
          fieldList = fieldList.concat(decoded);

        });

        // TODO: treeの開閉の状態をdataから取得して引き継ぐ

        // TODO: ソートの状態を引き継ぐ
        // 初回表示なら topicNameでソートする

        data = fieldList;

        // draw grid
        dataView.beginUpdate();
        dataView.setItems(fieldList);
        dataView.endUpdate();

      });
    });
  }

  // get Hz Bw
  function getHzBw(topic, type, info) {
    var defer = $.Deferred();

    ros.getTopicInfo(topic, type, function (value) {
      console.log('---- Hz Bw ----');
      // console.log(topic + '  /  ' + type);
      // console.log(value);
      info = value;
      defer.resolve();
    });
    return defer.promise();
  }

  function subscribeTopic(topic, type, subTopic) {
    var defer = $.Deferred();

    var sub = new ROSLIB.Topic({
      ros: ros,
      name: topic,
      messageType: type
    });
    sub.subscribe(function (message) {
      console.log('---- Received message ----');
      // console.log(topic + '  /  ' + type);
      // console.log(message);
      // console.log(message.data);

      defer.resolve();
    });

    return defer.resolve();
  }

  function getMessageDetailsAsync(message, callback, failedCallback) {
    var defer = $.Deferred();

    ros.getMessageDetails(message,
      function (result) {
        console.log('getMessageDetailsAsync success');
        callback(result);
        defer.resolve();
      },
      function (message) {
        console.log('getMessageDetailsAsync failed');
        failedCallback(message);
        defer.resolve();
      }
    );

    return defer.promise();
  }

  // var isCheckbox = false;
  function toggleTree(e, args) {
    var item = dataView.getItem(args.row);
    if (item) {
      if (!item._collapsed) {
        item._collapsed = true;
      } else {
        item._collapsed = false;
      }
      dataView.updateItem(item.id, item);
    }
    e.stopImmediatePropagation();
  }

  function changeCheckbox(e, args) {
    var item = dataView.getItem(args.row);
    var sub;
    if (item) {
      if (!item._checked) {
        item._checked = true;

        //subscribe
        sub = new ROSLIB.Topic({
          ros: ros,
          name: item.topic,
          messageType: item.type
        });
        subscribingMap[item.topic] = sub;
        sub.subscribe(function (msg) {
          subscribingValueMap[item.topic] = msg;
          // console.log(subscribingValueMap);
        });

      } else {
        item._checked = false;

        //unsubscribe
        subscribingMap[item.topic].unsubscribe();
        delete subscribingValueMap[item.topic];
        delete subscribingMap[item.topic];
      }
    }
    e.stopImmediatePropagation();
  }

  grid.onClick.subscribe(function gridClickhandler(e, args) {
    var $target = $(e.target);

    // event handler: toggle tree button
    if ($target.hasClass('toggle')) {
      toggleTree(e, args);
    }

    if ($target.hasClass('checkbox')) {
      changeCheckbox(e, args);
    }

  });

  dataView.onRowCountChanged.subscribe(function (e, args) {
    grid.updateRowCount();
    grid.render();
    grid.resizeCanvas();
    grid.autosizeColumns();
  });

  dataView.onRowsChanged.subscribe(function (e, args) {
    grid.invalidateRows(args.rows);
    grid.render();
  });

  $(window).on('load resize', function () {
    grid.resizeCanvas();
    grid.autosizeColumns();

    // prevent the delete button from being hidden when switching screens vertically
    grid.resizeCanvas();
  });

  $('#reload').on('click', function () {
    getTopics();
  });

  ////////////////////////////////////////
  // start screen
  initScreen();
});
