
var dataView = new Slick.Data.DataView({ inlineFilters: true });

$(function () {

  ////////////////////////////////////////
  // variables

  var ros = new ROSLIB.Ros();

  var serviceMap = {};

  // grid item definition
  var columns = [
    { id: 'tree', name: 'Tree', field: 'tree', width: 170, minWidth: 20, formatter: treeFormatter },
    { id: 'type', name: 'Type', field: 'type', width: 170, minWidth: 20, },
    { id: 'path', name: 'Path', field: 'path', width: 380, minWidth: 20, },
    { id: 'remove', name: '', field: 'remove', width: 30, minWidth: 30, maxWidth: 30, formatter: removeButtonFormatter }
  ];

  var data = [];
  var grid = new Slick.Grid('#myGrid', dataView, columns);

  var resParentId;
  var reqParentId;

  var resId = 0;
  var reqId = 1;


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

    // for dropdown
    requestService();
  }

  ////////////////////////////////////////
  // dropdown

  function requestService() {
    ros.getSrvList(
      function (result) {
        var objList = [];
        _.each(result.message, function (msg, index) {
          var replace = msg.split('\'').join('\"');
          var obj = JSON.parse(replace);
          objList.push(obj);
        });
        listDataAcquisition(objList);
      },
      function (mes) {
        console.log('getSrvList failed: %s', mes);
      }
    );
  }

  // service drop - down list
  function listDataAcquisition(objList) {
    for (var i = 0; i < objList.length; i++) {
      var recordData = objList[i];
      for (var j = 0; j < recordData.length; j++) {
        var serviceElement = recordData[j];
        var serviceStr = serviceElement.substring(0, serviceElement.indexOf('/'));
        var messageStr = serviceElement.substring(serviceElement.indexOf('/') + 1);

        if (serviceStr in serviceMap) {
          serviceMap[serviceStr].push(messageStr);
        } else {
          var mapValue = [messageStr];
          serviceMap[serviceStr] = mapValue;
        }
      }
    }
    buildServiceSelect(Object.keys(serviceMap));
  }

  function buildServiceSelect(packageList) {
    var optionsHtml = '';

    packageList.sort();
    for (var i = 0; i < packageList.length; i++) {
      optionsHtml += '<option value="' + packageList[i] + '">' + packageList[i] + '</option>';
    }

    var $select = $('#service-select');
    $select.empty();
    $select.append(optionsHtml);
    $select.change();
  }

  $('#service-select').on('change', function () {
    var selectedValue = $('#service-select').val();
    var messageList = serviceMap[selectedValue];
    var optionsHtml = '';

    messageList.sort();
    for (var i = 0; i < messageList.length; i++) {
      optionsHtml += '<option value="' + messageList[i] + '">' + messageList[i] + '</option>';
    }

    var $select = $('#message-select');
    $select.empty();
    $select.append(optionsHtml);
    $select.change();
  });


  ////////////////////////////////////////
  // grid

  function treeFormatter(row, cell, value, columnDef, dataContext) {
    if (value === null || value === undefined || dataContext === undefined) { return ''; }

    value = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var spacer = RwtUtils.getTreeSpacer(dataContext['indent']);
    var idx = dataView.getIdxById(dataContext.id);
    if (data[idx + 1] && data[idx + 1].indent > data[idx].indent) {
      if (dataContext._collapsed) {
        return spacer + RwtUtils.getTreeExpandButton() + value;
      } else {
        return spacer + RwtUtils.getTreeCollapseButton() + value;
      }
    } else {
      return spacer + RwtUtils.getTreeLeafButton() + value;
    }
  }

  // remove column
  function removeButtonFormatter(row, cell, value, columnDef, dataContext) {
    if (value === null || value === undefined || dataContext === undefined) { return ''; }
    var parentId = dataContext.parent;
    if (parentId === null) {
      return '<a class="icon delete-button"><i class="material-icons">remove_circle</i></a>';
    }
    return '';
  }

  // Tree structure
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

  $('#add-button').on('click', function () {
    var serviceName = $('#service-select').val();
    var messageName = $('#message-select').val();
    var typeName = serviceName + '/' + messageName;

    var requestDefer = $.Deferred();
    var responseDefer = $.Deferred();
    var promises = [requestDefer.promise(), responseDefer.promise()];

    var reqData = [];
    var resData = [];

    ros.getServiceRequestDetails(typeName,
      function (types) {

        var reqDataRetention = ({
          id: reqId,
          indent: 0,
          parent: null,
          tree: 'Request',
          type: typeName,
          path: typeName,
          remove: '',
          _collapsed: true,
        });

        reqParentId = reqId;
        reqId = reqId + 2;
        var reqChildren = [];
        var typedefsData = types['typedefs'];
        var childReqData = typedefsData[0];
        var fieldarraylen = childReqData['fieldarraylen'];
        var fieldnames = childReqData['fieldnames'];
        var fieldtypes = childReqData['fieldtypes'];
        for (var i = 0; i < fieldnames.length; i++) {
          var len = fieldarraylen[i];
          reqData.push({
            id: reqId,
            indent: 1,
            fieldarraylen: fieldarraylen[i],
            parent: reqParentId,
            tree: fieldnames[i],
            type: fieldtypes[i] + (len !== -1 ? '[]' : ''),
            path: typeName + '/' + fieldnames[i],
            remove: '',
          });
          reqChildren.push(reqId);
          reqId = reqId + 2;
        }
        reqDataRetention.children = reqChildren;
        reqData.push(reqDataRetention);
        requestDefer.resolve({ key: 'request', value: reqData });
      },
      function (message) {
        console.log('getParams failed: %s', message);
        requestDefer.resolve();
      }
    );

    ros.getServiceResponseDetails(typeName,
      function (types) {
        var resDataRetention = ({
          id: resId,
          indent: 0,
          parent: null,
          tree: 'Response',
          type: typeName,
          path: typeName,
          remove: '',
          _collapsed: true,
        });

        resParentId = resId;
        resId = resId + 2;
        var resChildren = [];
        var typedefsData = types['typedefs'];
        var childReqData = typedefsData[0];
        var fieldarraylen = childReqData['fieldarraylen'];
        var fieldnames = childReqData['fieldnames'];
        var fieldtypes = childReqData['fieldtypes'];
        for (var i = 0; i < fieldnames.length; i++) {
          var len = fieldarraylen[i];
          resData.push({
            id: resId,
            indent: 1,
            fieldarraylen: fieldarraylen[i],
            parent: resParentId,
            tree: fieldnames[i],
            type: fieldtypes[i] + (len !== -1 ? '[]' : ''),
            path: typeName + '/' + fieldnames[i],
            remove: '',
          });
          resChildren.push(resId);
          resId = resId + 2;
        }
        resDataRetention.children = resChildren;
        resData.push(resDataRetention);

        responseDefer.resolve({ key: 'response', value: resData });
      },
      function (message) {
        console.log('getParams failed: %s', message);

        responseDefer.resolve({ key: 'response', value: resData });
      },
      function (message) {
        console.log('getParams failed: %s', message);
        responseDefer.resolve();
      }
    );

    // When the asynchronous processing is terminated 
    $.when.apply(null, promises).done(function () {

      var reqData;
      var resData;
      for (var i = 0; i < arguments.length; i++) {
        var key = arguments[i].key;
        var value = arguments[i].value;

        if (key === 'request') {
          reqData = value;
        } else {
          resData = value;
        }
      }

      reqData.sort(function (a, b) {
        return (a.id - b.id);
      });

      resData.sort(function (a, b) {
        return (a.id - b.id);
      });

      var mergedData = reqData.concat(resData);
      dataView.beginUpdate();
      _.each(mergedData, function (item, index) {
        dataView.addItem(item);
      });
      dataView.endUpdate();
    });
  });

  grid.onClick.subscribe(function (e, args) {
    var $target = $(e.target);

    // tree　open/close handler
    if (RwtUtils.isTreeToggleButton($target)) {
      var item = dataView.getItem(args.row);
      if (item) {
        if (!item._collapsed) {
          item._collapsed = true;
        } else {
          item._collapsed = false;
        }
        dataView.beginUpdate();
        dataView.updateItem(item.id, item);
        dataView.endUpdate();
      }
      e.stopImmediatePropagation();
    }

    // remove handler
    else if ($target.parent().hasClass('delete-button')
      || $target.hasClass('delete-button')) {
      var items = dataView.getItem(args.row);
      if (items) {
        var parentItem = dataView.getItemById(items.id);
        var childrenId = parentItem.children;
        dataView.beginUpdate();
        _.each(childrenId,
          function (id, index) {
            dataView.deleteItem(id);
          });
        dataView.deleteItem(items.id);
        dataView.endUpdate();
      }
    }
  });

  // wire up model events to drive the grid
  dataView.onRowCountChanged.subscribe(function (e, args) {
    grid.updateRowCount();
    grid.render();
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

  ////////////////////////////////////////
  // start screen
  initScreen();
});
