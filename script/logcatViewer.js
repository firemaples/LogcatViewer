// http://localhost:8080/job/UI%20automator%20Test/ws/aba/test/TestScript/HtmlReport/logcatViewer.html?file=../Logcat.txt
var currentType = "E"
var maxLinesToShow = 50;
var db;
var timeCounter = [];
var rowColor = [];
$(function () {
    $(".scriptNotAllowBlock").remove();
    init();
    initDb();
    var filePath = getUrlParameter("file");
    if (filePath != null) {
        loadLogcatFileFromUrl(filePath);
    }
    setTimeout(function () {}, 500);
});

function onTypeChange(type) {
    console.log("change type to: " + type);
    $("#dd_type").html(type + " <span class='caret'></span>");
    $("#dd_type~ul>li>a").each(function () {
        if (type.toLowerCase() == $(this).text().toLowerCase()) {
            currentType = $(this).data("short");
            console.log("shorten type name: " + currentType);
            $("#dd_type~ul>li").each(function () {
                $("#dd_type").removeClass($(this).data("btn-color"));
            })
            $("#dd_type").addClass($(this).parent().data("btn-color"));
        }
    })
}

function init() {
    rowColor['V'] = '';
    rowColor['D'] = 'info';
    rowColor['I'] = 'success';
    rowColor['W'] = 'warning';
    rowColor['E'] = 'danger';
    rowColor['A'] = 'danger';
    $("#dd_type~ul>li").click(function () {
        var type = $(this).text();
        onTypeChange(type);
    })
    $("#bt_filter").click(function () {
        drawData();
    })
    $("#clearFilterText").click(function () {
        $("#inp_filter").val('');
    })
    var startTime = getUrlParameter("startTime");
    if (startTime != null) {
        startTime = moment(startTime, "MM-DD HH:mm:ss.SSS");
    }
    else {
        startTime = false;
    }
    var endTime = getUrlParameter("endTime");
    if (endTime != null) {
        endTime = moment(endTime, "MM-DD HH:mm:ss.SSS");
    }
    else {
        endTime = false;
    }
    $("#beginTime").datetimepicker({
        format: 'MM-DD HH:mm:ss.SSS'
        , showTodayButton: true
        , showClear: true
        , defaultDate: startTime
    });
    $("#endTime").datetimepicker({
        useCurrent: false
        , format: 'MM-DD HH:mm:ss.SSS'
        , showTodayButton: true
        , showClear: true
        , defaultDate: endTime
    });
    $("#beginTime").on("dp.change", function (e) {
        $('#endTime').data("DateTimePicker").minDate(e.date);
    });
    $("#endTime").on("dp.change", function (e) {
        $('#beginTime').data("DateTimePicker").maxDate(e.date);
    });
    var type = getUrlParameter("type");
    if (type != null) {
        onTypeChange(type);
    }
}

function initDb() {
    db = openDatabase("logcatDB", "1.0", "Logcat Database", 2 * 1024 * 1024);
}

function initTable() {
    db.transaction(function (tx) {
        tx.executeSql("DROP TABLE IF EXISTS Logcats;");
        tx.executeSql("CREATE TABLE IF NOT EXISTS Logcats (id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT, processBeg INTEGER, processEnd INTEGER, type CHAR(1), msg TEXT);");
    });
}

function executeSql(sqls, withDialog, onSuccess) {
    db.transaction(function (tx) {
        startTimeCounter('Sql exec');
        if (withDialog) showProcessDialog('Data processing');
        for (var i = 0; i < sqls.length; i++) {
            var sql = sqls[i];
            //            console.log(sql);
            tx.executeSql(sql, [], function (tx, result) {
                //                console.log("Query Success");
            }, function (tx, error) {
                console.log("Query Error: " + error.message);
            });
        }
    }, function (error) {
        endTimeCounter('Sql exec');
        if (withDialog) hideProcessDialog();
        console.log("Transaction Error: " + error.message);
    }, function () {
        endTimeCounter('Sql exec');
        if (withDialog) hideProcessDialog();
        console.log("Transaction Success");
        if (onSuccess != null) onSuccess();
    });
}

function loadLogcatFileFromUrl(url) {
    startTimeCounter("Loading logcat file");
    showProcessDialog("Loading logcat file");
    $.get(url, onLogcatFileLoaded);
}

function onLogcatFileLoaded(data) {
    endTimeCounter("Loading logcat file");
    hideProcessDialog();
    console.log("data length:" + data.length);
    parseDataToDb(data);
}

function splitData(string, n) {
    var parts = string.split(/[ ]+/);
    return parts.slice(0, n - 1).concat([parts.slice(n - 1).join(" ")]);
}

function parseDataToDb(data) {
    initTable();
    var rawData = data.split("\n");
    console.log("row count:" + rawData.length);
    var insertSqls = [];
    for (var i = 0, picked = 0, len = rawData.length; i < len; i++) {
        var row = rawData[i];
        if (row != null) {
            var splitedRow = splitData(row, 6);
            if (splitedRow.length >= 6) {
                var sql = "INSERT INTO Logcats VALUES (NULL,'" + splitedRow[0] + " " + splitedRow[1] + "'," + splitedRow[2] + "," + splitedRow[3] + ",'" + splitedRow[4] + "','" + splitedRow[5].replace(/'/g, "''") + "');";
                insertSqls.push(sql);
            }
        }
    }
    executeSql(insertSqls, true, function () {
        setTimeout(drawData, 800);
    });
}

function drawData() {
    showProcessDialog("Preparing data");
    db.transaction(function (tx) {
        startTimeCounter('draw data > get records from db');
        var searchWord = $("#inp_filter").val();
        var beginTime = $('#beginTime').data("DateTimePicker").date();
        var endTime = $('#endTime').data("DateTimePicker").date();
        var timeFilter = "";
        if (beginTime != null) {
            var timeString = beginTime.format("MM-DD HH:mm:ss.SSS");
            timeFilter += " AND time >= '" + timeString + "'";
        }
        if (endTime != null) {
            var timeString = endTime.format("MM-DD HH:mm:ss.SSS");
            timeFilter += " AND time <= '" + timeString + "'";
        }
        var sql = "SELECT * FROM Logcats WHERE type IN (" + getTypeFilterString(currentType) + ") AND msg LIKE '%" + searchWord + "%'" + timeFilter;
        console.log("Current search sql: " + sql);
        tx.executeSql(sql, [], function (tx, results) {
            endTimeCounter('draw data > get records from db');
            $("#resultCount").text("Result count: " + results.rows.length);
            console.log("query result count: " + results.rows.length);
            startTimeCounter('Prepare table string');
            var tableString = "<table class='table table-striped table-hover'><tr><th>Id</th><th>Time</th><th>Process begin</th><th>Process end</th><th>Type</th><th>Message</th></tr>";
            var rowString = "";
            var table = $(tableString);
            $.each(results.rows, function (index, row) {
                var currentRowString = "<tr class='" + rowColor[row.type] + "'>";
                currentRowString += "<td class='id'>" + row.id + "</td>";
                currentRowString += "<td class='time'>" + row.time + "</td>";
                currentRowString += "<td class='processBeg'>" + row.processBeg + "</td>";
                currentRowString += "<td class='processEnd'>" + row.processEnd + "</td>";
                currentRowString += "<td class='type'>" + row.type + "</td>";
                currentRowString += "<td class='msg'>" + row.msg + "</td>";
                currentRowString += "</tr>";
                rowString += currentRowString;
            })
            endTimeCounter('Prepare table string');
            startTimeCounter('Put table string to screen');
            tableString += rowString + "</table>";
            $("div#logcatWrapper").html(tableString);
            endTimeCounter('Put table string to screen');
            hideProcessDialog();
        }, null);
    });
}

function getTypeFilterString(type) {
    var typeFilterStringArr = [];
    switch (type) {
    case "V":
        typeFilterStringArr.push("V");
    case "D":
        typeFilterStringArr.push("D");
    case "I":
        typeFilterStringArr.push("I");
    case "W":
        typeFilterStringArr.push("W");
    case "E":
        typeFilterStringArr.push("E");
    case "A":
        typeFilterStringArr.push("A");
    }
    var typeFilterString = "";
    $.each(typeFilterStringArr, function (index, value) {
        if (typeFilterString.length > 0) {
            typeFilterString += ",";
        }
        typeFilterString += "'" + value + "'";
    });
    return typeFilterString;
}

function getUrlParameter(sParam) {
    var sPageURL = decodeURIComponent(window.location.search.substring(1))
        , sURLVariables = sPageURL.split("&")
        , sParameterName, i;
    for (i = 0; i < sURLVariables.length; i++) {
        sParameterName = sURLVariables[i].split("=");
        if (sParameterName[0] === sParam) {
            return sParameterName[1] === undefined ? true : sParameterName[1];
        }
    }
};

function showProcessDialog(msg) {
    waitingDialog.show(msg);
}

function hideProcessDialog() {
    waitingDialog.hide();
}

function addThousandCommas(nStr) {
    nStr += '';
    var x = nStr.split('.');
    var x1 = x[0];
    var x2 = x.length > 1 ? '.' + x[1] : '';
    var rgx = /(\d+)(\d{3})/;
    while (rgx.test(x1)) {
        x1 = x1.replace(rgx, '$1' + ',' + '$2');
    }
    return x1 + x2;
}

function startTimeCounter(key) {
    timeCounter[key] = new Date();
}

function endTimeCounter(key) {
    if (timeCounter[key] != null) {
        var duration = new Date() - timeCounter[key];
        timeCounter[key] = null;
        console.log("Timer for [" + key + "]: " + addThousandCommas(duration) + " milliseconds");
    }
}