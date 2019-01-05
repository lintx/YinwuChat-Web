(function () {
    var app = angular.module('app',[]);
    app.controller('yinwuchatCtrl',['$scope','$timeout',lmcCtrl]);
    app.filter('unsafe', ['$sce', function ($sce) {
        return function (val) {
            return $sce.trustAsHtml(val);
        };
    }]).filter('int2date',function () {
        return function (val) {
            return moment(val).format('YYYY-MM-DD HH:mm:ss');
        }
    });
    function lmcCtrl($scope,$timeout) {
        $scope.message = [];
        $scope.chat = {message:""};
        $scope.historyMessage = [];
        $scope.historyMessageIndex = 0;
        var islogin = false;

        var msg_type_err = 2,msg_type_info = 1,msg_type_default = 0,msg_type_server = 3;
        function formatMessageHtmlObj(message, type, time) {
            var obj = {message:message};
            switch (type) {
                case 2:
                    obj.type = "error";
                    break;
                case 1:
                    obj.type = "info";
                    break;
                case 3:
                    obj.type = "server";
                    break;
                default:
                    obj.type = "message";
                    break;
            }
            obj.time = typeof time === "undefined" ? new Date().getTime() : time;
            return obj;
        }
        function addMessage(message, type, time) {
            $scope.message.push(formatMessageHtmlObj(message,type,time));
        }
        function insMessage(message, type, time) {
            $scope.message.splice(0,0,formatMessageHtmlObj(message,type,time));
        }
        function notWebSocket() {
            addMessage("看起来你的浏览器不支持WebSocket，YinwuChat的运行依赖于WebSocket，你需要一个支持WebSocket的浏览器，比如Chrome，才能正常使用。",msg_type_err);
        }

        if (typeof WebSocket !== "function" && typeof MozWebSocket !== "function") {
            notWebSocket();
            return;
        }

        var ws;
        var protocol = location.protocol.toLocaleLowerCase() === "https:" ? "wss" : "ws";
        var wsurl = protocol + "://" + location.host + "/ws";

        var WsHelper = {
            timeout:2000,
            heardCheckTimeout:60000,
            heardCheckTimeoutObj: null,
            heardCheckReset: function(){
                clearInterval(this.heardCheckTimeoutObj);
                this.heardCheckStart();
            },
            heardCheckStart: function(){
                this.heardCheckTimeoutObj = setInterval(function(){
                    if(ws.readyState===1){
                        ws.send("HeartBeat");
                    }
                }, this.heardCheckTimeout)
            },

            lockReconnect:false,
            start:function () {
                var self = this;
                if (this.lockReconnect) return;
                this.lockReconnect = true;
                $timeout(function () {
                    self.lockReconnect = false;
                    self.create();
                },this.timeout);
            },
            create:function () {
                try {
                    if ('WebSocket' in window){
                        ws = new WebSocket(wsurl);
                    }
                    else if ('MozWebSocket' in window) {
                        ws = new MozWebSocket(wsurl);
                    }
                    this.bindEvent();
                }
                catch (e) {
                    notWebSocket();
                    this.start();
                }
            },
            bindEvent:function () {
                var self = this;
                ws.onopen = function(){
                    addMessage("连接服务器成功，正在校验token",msg_type_info);
                    sendCheckToken(getToken());
                    self.heardCheckStart();
                };

                ws.onmessage = function(e){
                    self.heardCheckReset();
                    var json = e.data;
                    try {
                        var data = JSON.parse(json);
                        switch (data.action) {
                            case "update_token":
                                updateToken(data.token);
                                break;
                            case "check_token":
                                checkToken(data.status,data.isbind,data.message);
                                break;
                            case "send_message":
                                onMessage(data.time,data.player,data.message,data.server,data.message_id);
                                break;
                            case "private_message":
                                onPrivateMessage(data.time,data.player,data.message,data.server,data.message_id);
                                break;
                            case "me_private_message":
                                onMePrivateMessage(data.time,data.player,data.message,data.server,data.message_id);
                                break;
                            case "player_join":
                            case "player_leave":
                            case "player_switch_server":
                                onPlayerStatusMessage(data.time,data.player,data.server,data.action);
                                break;
                            case "player_web_join":
                            case "player_web_leave":
                                onWebPlayerStatusMessage(data.time,data.player,data.action);
                                break;
                            case "server_message":
                                onServerMessage(data.time,data.message,data.status);
                                break;
                            case "offline_message":
                                onOfflineMessage(data.messages);
                                break;
                            case "game_player_list":
                                $scope.$apply(function () {
                                    $scope.player_list.game = data.player_list;
                                });
                                break;
                            case "web_player_list":
                                $scope.$apply(function () {
                                    $scope.player_list.web = data.player_list;
                                });
                                break;
                        }
                    }
                    catch (e) {
                        console.error(e)
                    }
                };
                ws.onclose = function(e){
                    if (e.code === 3000) {
                        return;
                    }
                    $scope.$apply(function () {
                        addMessage("WebSocket断开了连接，正在重新连接",msg_type_info);
                        self.start();
                        islogin = true;
                    });
                };
                ws.onerror = function (err) {
                    // $scope.$apply(function () {
                    //     addMessage("发生了错误：" + err.message,msg_type_err);
                    // });
                };
            }
        };

        function onOfflineMessage(messages){
            for (var i = 0; i < messages.length; i++) {
                var data = messages[i];
                if (typeof data === "object") {
                    //console.log(data)
                    switch (data.action) {
                        case "send_message":
                            onOfflineBroadMessage(data.time,data.player,data.message,data.server,data.message_id);
                            break;
                        case "private_message":
                            onOfflinePrivateMessage(data.time,data.player,data.message,data.server,data.message_id);
                            break;
                        case "me_private_message":
                            onOfflineMePrivateMessage(data.time,data.player,data.message,data.server,data.message_id);
                            break;
                    }
                }
            }
        }

        addMessage("正在连接服务器",msg_type_info);
        WsHelper.create();

        function getToken(){
            var token = localStorage.getItem("yinwuchat_token");
            if (typeof token !== "string") {
                token = "";
            }
            return token;
        }

        function saveToken(token){
            localStorage.setItem("yinwuchat_token",token);
        }

        function sendCheckToken(token){
            var obj = {
                action:"check_token",
                token:token
            };
            ws.send(JSON.stringify(obj));
        }

        function sendMessage(message,status){
            message = message.replace(/&([0-9abcdef])([^&]*)/ig, (regex, color, msg) => {
                return "§" + color + msg;
            });

            message = message.replace(/&([klmnor])([^&]*)/ig, (regex, style, msg) => {
                return msg;
            });

            message = message.replace(/§([klmnor])([^§]*)/ig, (regex, style, msg) => {
                return msg;
            });

            var obj = {
                action:"send_message",
                message:message
            };
            ws.send(JSON.stringify(obj));
        }

        function addBindMsg(token) {
            $scope.$apply(function () {
                addMessage("请进入游戏，并<span class='badge badge-warning'>在游戏内输入命令</span><span class='badge badge-light'>/yinwuchat bind " + token + " 备注</span>以绑定token，备注可以在使用<span class='badge badge-light'>/yinwuchat list</span>命令时查询到，当然，你也可以省略备注。",msg_type_info);
            });
        }
        
        function updateToken(token){
            saveToken(token);
            addBindMsg(token);
        }
        
        function checkToken(status,isbind,message){
            if (!status) {
                $scope.$apply(function () {
                    addMessage(message,msg_type_err);
                });
            }
            else {
                if (isbind) {
                    $scope.$apply(function () {
                        addMessage("token校验成功，你现在可以发送消息到游戏内了",msg_type_info);
                        islogin = true;
                    });
                }
                else {
                    addBindMsg(getToken());
                }
            }
        }

        function getAllMessage(player, message, server) {
            message = "§e" + getClickPlayer(player) + " §7> §f" + message;
            if (typeof server === "string") {
                message = "§b[" + server + "] " + message;
            }

            message = formatMessage(message);
            return message;
        }

        function onMessage(time,player,message,server,last_id){
            message = getAllMessage(player,message,server);

            $scope.$apply(function () {
                addMessage(message,msg_type_default,time);
                if (typeof last_id !== "undefined" && last_id>0 && $scope.offline.last_id===0) {
                    $scope.offline.last_id = last_id;
                }
            });
        }

        function onOfflineBroadMessage(time, player, message, server, last_id) {
            message = getAllMessage(player,message,server);

            $scope.$apply(function () {
                insMessage(message,msg_type_default,time);
                if (typeof last_id !== "undefined" && last_id>0) {
                    $scope.offline.last_id = last_id;
                }
            });
        }

        function getPrivateMessage(player, message, server) {
            message = "§e" + getClickPlayer(player) + "§7悄悄的对你说: §f" + message;
            if (typeof server === "string") {
                message = "§b[" + server + "] " + message;
            }

            message = formatMessage(message);
            return message;
        }

        function onPrivateMessage(time,player,message,server,last_id){
            message = getPrivateMessage(player,message,server);

            $scope.$apply(function () {
                addMessage(message,msg_type_default,time);
                if (typeof last_id !== "undefined" && last_id>0 && $scope.offline.last_id===0) {
                    $scope.offline.last_id = last_id;
                }
            });
        }

        function getMePrivateMessage(player, message, server) {
            message = "§7你悄悄的对§e" + getClickPlayer(player) + "§7说: §f" + message;
            if (typeof server === "string") {
                message = "§b[" + server + "] " + message;
            }

            message = formatMessage(message);
            return message;
        }

        function onMePrivateMessage(time,player,message,server,last_id){
            message = getMePrivateMessage(player,message,server);

            $scope.$apply(function () {
                addMessage(message,msg_type_default,time);
                if (typeof last_id !== "undefined" && last_id>0 && $scope.offline.last_id===0) {
                    $scope.offline.last_id = last_id;
                }
            });
        }

        function onOfflinePrivateMessage(time,player,message,server,last_id){
            message = getPrivateMessage(player,message,server);

            $scope.$apply(function () {
                insMessage(message,msg_type_default,time);
                if (typeof last_id !== "undefined" && last_id>0) {
                    $scope.offline.last_id = last_id;
                }
            });
        }

        function onOfflineMePrivateMessage(time,player,message,server,last_id){
            message = getMePrivateMessage(player,message,server);

            $scope.$apply(function () {
                insMessage(message,msg_type_default,time);
                if (typeof last_id !== "undefined" && last_id>0 && $scope.offline.last_id===0) {
                    $scope.offline.last_id = last_id;
                }
            });
        }

        function getClickPlayer(player) {
            return "<span class='cursor-hand' title='点击向"+player+"发送私聊消息' ng-click='setMsgCmd(\""+player+"\")'>"+player+"</span>"
        }

        function onServerMessage(time,message,status){
            message = formatMessage(message);

            $scope.$apply(function () {

                switch (status) {
                    case 1001:
                        $scope.offline.canload = false;
                        insMessage(message,msg_type_server,time);
                        break;
                    default:
                        addMessage(message,msg_type_server,time);
                        break;
                }
            });
        }

        function formatMessage(message) {
            message = message.replace(/&([0-9abcdef])([^&]*)/ig, (regex, color, msg) => {
                return "§" + color + msg;
            });

            message = message.replace(/&([klmnor])([^&]*)/ig, (regex, style, msg) => {
                return msg;
            });

            message = message.replace(/§([klmnor])([^§]*)/ig, (regex, style, msg) => {
                return msg;
            });

            message = message.replace(/§([0-9abcdef])([^§]*)/ig, (regex, color, msg) => {
                //msg = msg.replace(/ /g, '&nbsp;');
                return `<span class="color-${color}">${msg}</span>`;
            });
            return message;
        }

        function onPlayerStatusMessage(time,player,server,status){
            var message = "";
            switch (status) {
                case "player_join":
                    message = "§6玩家§e" + getClickPlayer(player) + "§6";
                    message += "加入了游戏";
                    if (server.length > 0) {
                        message += "，所在服务器：§b" + server;
                    }
                    break;
                case "player_leave":
                    message = "§6玩家§e" + player + "§6";
                    message += "退出了游戏";
                    break;
                case "player_switch_server":
                    message = "§6玩家§e" + getClickPlayer(player) + "§6";
                    message += "加入了服务器：§b" + server;
                    break;
            }
            message = formatMessage(message);
            $scope.$apply(function () {
                addMessage(message,msg_type_default,time);
            });
        }

        function onWebPlayerStatusMessage(time,player,status){
            var message = "";
            switch (status) {
                case "player_web_join":
                    message = "§6玩家§e" + getClickPlayer(player) + "§6";
                    message += "加入了YinwuChat";
                    break;
                case "player_web_leave":
                    message = "§6玩家§e" + player + "§6";
                    message += "离开了YinwuChat";
                    break;
            }
            message = formatMessage(message);
            $scope.$apply(function () {
                addMessage(message,msg_type_default,time);
            });
        }

        $scope.onchat = function(){
            if ($scope.chat.message.length === 0) {
                return;
            }
            $scope.historyMessage.push($scope.chat.message);
            if ($scope.historyMessage.length > 100) {
                $scope.historyMessage.shift();
            }
            $scope.historyMessageIndex = $scope.historyMessage.length;
            if (islogin) {
                sendMessage($scope.chat.message);
            }
            else {
                addMessage("你还没有连接到服务器，或者token校验失败，或者token尚未绑定，暂时无法发送消息",msg_type_err);
            }
            $scope.chat.message = "";
        };
        $scope.chatKeyUp = function(ev){
            if (ev.ctrlKey || ev.shiftKey || ev.altKey) {
                return;
            }
            if (ev.which === 38) {
                if ($scope.historyMessageIndex > $scope.historyMessage.length) {
                    $scope.historyMessageIndex = $scope.historyMessage.length;
                }
                $scope.historyMessageIndex -= 1;
                $scope.chat.message = $scope.historyMessage[$scope.historyMessageIndex];
            }
            else if (ev.which === 40) {
                if ($scope.historyMessageIndex < -1) {
                    $scope.historyMessageIndex = -1;
                }
                $scope.historyMessageIndex += 1;
                $scope.chat.message = $scope.historyMessage[$scope.historyMessageIndex];
            }
        };

        $scope.offline = {
            isloading : false,
            canload : true,
            last_id : 0
        };
        $scope.getOfflineMessage = function () {
            $scope.offline.isloading = true;
            var obj = {
                action:"offline_message",
                last_id:$scope.offline.last_id
            };
            ws.send(JSON.stringify(obj));
            $timeout(function () {
                $scope.offline.isloading = false;
            },1000);
        };

        $scope.setMsgCmd = function (player) {
            $scope.chat.message = "/yinwuchat msg " + player + "";
        };

        $scope.player_list = {
            game:[],
            web:[]
        };
        $scope.setting = {
            show_time:true,
            show_player_list:false
        };
        try {
            if (angular.element(document).width() < 600) {
                $scope.setting.show_time = false;
            }
        }
        catch (e) {

        }
    }
    app.directive('repeatHack', function($rootScope) {
        return {
            link: function(scope, element, attrs) {
                var _window = angular.element(window);
                var _document = angular.element(document);
                var _html = angular.element('html');
                var _body = angular.element('body');
                if (!$rootScope.__repeatHackIsInit) {
                    $rootScope.__repeatHackIsInit = true;
                    $rootScope.__repeatHackIsBottom = true;
                    _window.on('scroll',function () {
                        $rootScope.__repeatHackIsBottom = _document.height() - _window.height() - (_html.scrollTop() || _body.scrollTop()) <= 50;
                    })
                }
                if ((scope.$last || scope.$first) && $rootScope.__repeatHackIsBottom){
                    setTimeout(function () {
                        var top = _document.height() - _window.height();
                        //console.log(_document.height() , _window.height(),_document.height() - _window.height() - (_html.scrollTop() || _body.scrollTop()))
                        _html.scrollTop(top);
                        _body.scrollTop(top);
                    },100);
                }
                if (scope.$first) {
                    //console.log(_document.height() , _window.height(),_document.height() - _window.height() - (_html.scrollTop() || _body.scrollTop()))
                }
            }
        };
    });
    app.directive('compile', ['$compile', function ($compile) {
        return function(scope, element, attrs) {
            scope.$watch(
                function(scope) {
                    return scope.$eval(attrs.compile);
                },
                function(value) {
                    element.html(value);
                    $compile(element.contents())(scope);
                }
            )};
    }])
})();