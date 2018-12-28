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

        var msg_type_err = 2,msg_type_info = 1,msg_type_default = 0;
        function addMessage(message, type, time) {
            var obj = {message:message};
            switch (type) {
                case 2:
                    obj.type = "error";
                    break;
                case 1:
                    obj.type = "info";
                    break;
                default:
                    obj.type = "message";
                    break;
            }
            obj.time = typeof time === "undefined" ? new Date().getTime() : time;
            $scope.message.push(obj);
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
                                onMessage(data.time,data.player,data.message);
                                break;
                        }
                    }
                    catch (e) {

                    }
                };
                ws.onclose = function(){
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

        function sendMessage(message){
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
                addMessage("请进入游戏，并输入命令<span class='badge badge-light'>/yinwuchat bind " + token + " 备注</span>以绑定token，备注可以在使用<span class='badge badge-light'>/yinwuchat list</span>命令时查询到，当然，你也可以省略备注。",msg_type_info);
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
        
        function onMessage(time,player,message,apply){
            message = "§f" + player + " §7> §f" + message;

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
                msg = msg.replace(/ /g, '&nbsp;');
                return `<span class="color-${color}">${msg}</span>`;
            });

            if (apply !== false) {
                $scope.$apply(function () {
                    addMessage(message,msg_type_default,time);
                });
            }
            else {
                addMessage(message,msg_type_default,time);
            }
        }



        $scope.onchat = function(){
            $scope.historyMessage.push($scope.chat.message);
            if ($scope.historyMessage.length > 100) {
                $scope.historyMessage.shift();
            }
            $scope.historyMessageIndex = $scope.historyMessage.length;
            if (islogin) {
                sendMessage($scope.chat.message);
                onMessage(new Date().getTime(),"你",$scope.chat.message,false);
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
                    var top = _document.height() - _window.height();
                    _html.scrollTop(top);
                    _body.scrollTop(top);
                }
            }
        };
    });
})();