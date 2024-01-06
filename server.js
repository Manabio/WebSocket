'use strict';

// グローバル変数
const express = require('express');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const app = express();
const server = http.Server(app);
const io = socketIO(server);

const FIELD_WIDTH = 1000, FIELD_HEIGHT = 1000;

// ゲーム クラス
class GameObject{
	constructor(obj={}){
		this.id = Math.floor(Math.random()*1000000000);
		this.x = obj.x;
		this.y = obj.y;
		this.width  = obj.width;
		this.height = obj.height;
		this.angle  = obj.angle;
	}

	// 移動
	move(distance){
		const oldX = this.x, oldY = this.y;

		this.x += distance * Math.cos(this.angle);
		this.y += distance * Math.sin(this.angle);

		let collision = false;
		if(this.x < 0 || this.x + this.width >= FIELD_WIDTH || this.y < 0 || this.y + this.height >= FIELD_HEIGHT){
		collision = true;
	}
	if(this.intersectWalls()){
		collision = true;
	}
	if(collision){
		this.x = oldX; this.y = oldY;
	}
	return !collision;
	}

	// 衝突判定（描画範囲）
	intersect(obj){
		return (this.x <= obj.x + obj.width) &&
			(this.x + this.width >= obj.x) &&
			(this.y <= obj.y + obj.height) &&
			(this.y + this.height >= obj.y);
	}

	// 衝突判定（壁）
	intersectWalls(){
		return Object.values(walls).some((wall) => {
				if(this.intersect(wall)){
				return true;
			}
		});
	}

	toJSON(){
		return {id: this.id, x: this.x, y: this.y, width: this.width, height: this.height, angle: this.angle};
	}
};

// プレイヤー クラス（= Gameクラスの子宣言）
class Player extends GameObject{
	constructor(obj={}){
		super(obj);
		this.socketId = obj.socketId;
		this.nickname = obj.nickname;
		this.width    = 80;
		this.height   = 80;
		this.health   = this.maxHealth = 10;
		this.bullets  = {};
		this.point    = 0;
		this.movement = {};
		this.shootable = 0; // shoot可:0、不可:1

		do{
			this.x = Math.random() * (FIELD_WIDTH  - this.width);
			this.y = Math.random() * (FIELD_HEIGHT - this.height);
			this.angle = Math.random() * 2 * Math.PI;
		}while(this.intersectWalls());
	}

	// 'shoot'を受けとった時
	shoot(){
		// 同時 発射は３発まで
	if(Object.keys(this.bullets).length >= 3){
		this.shootable = 1;
		return;
	}
	this.shootable = 0;
	const bullet = new Bullet({
		x: this.x + this.width/2,
		y: this.y + this.height/2,
		angle: this.angle,
		player: this,
	});
	bullet.move(yhis.width/2);	
	this.bullets[bullet.id] = bullet;
	bullets[bullrts.id] = bullet;
	}

	// 'damage'を受けとった時
	damage(){
		this.health--;
		if(this.health === 0){
			this.remove();
		}
	}

	// プレイ終了
	remove(){
		delete players[this.id];
		io.to(this.socketId).emit('dead');
	}

	// JSON 記録
	toJSON(){
		return Object.assign(super.toJSON(), {health: this.health, maxHealth: this.maxHealth, socketId: this.socketId, point: this.point, nickname: this.nickname, shootable: this.shootable});
	}
};

// 弾 クラス（= Gameクラスの子宣言）
class Bullet extends GameObject{
	constructor(obj){
		super(obj);
		this.width  = 8; // 弾の半径
		this.height = 8;
		this.player = obj.player;
	}

	// 削除
	remove(){
		delete this.player.bullets[this.id];
		delete bullets[this.id];
		this.player.shootable = 0;
	}
};

// ボットプレイヤー（= プレイヤークラスの子宣言）
class BotPlayer extends Player{
	constructor(obj){
		super(obj);
		this.timer = setInterval(() => {
			if(! this.move(4)){
				this.angle = Math.random() * Math.PI * 2;
			}
			if(Math.random()<0.03){
				this.shoot();
			}
		}, 1000/30);
	}

	remove(){
		super.remove();
		clearInterval(this.timer);
		setTimeout(() => {
			const bot = new BotPlayer({nickname: this.nickname});
			players[bot.id] = bot;
		}, 3000);
	}
};

// 壁 クラス（= Gameクラスの子宣言）
class Wall extends GameObject{
};

// グローバル 変数（オブジェクト）
let players = {}; // プレイヤー
let bullets = {}; // 弾
let walls   = {}; // 壁

// 壁（200px*50px）３つ作成
for(let i=0; i<3; i++){
    const wall = new Wall({
            x: Math.random() * FIELD_WIDTH,
            y: Math.random() * FIELD_HEIGHT,
            width: 200,
            height: 50,
    });
    walls[wall.id] = wall;
}

// ボット 生成
const bot = new BotPlayer({nickname: 'bot'});
players[bot.id] = bot;

// socket.io
io.on('connection', function(socket) {
    let player = null;
    socket.on('game-start', (config) => {
        player = new Player({
            socketId: socket.id,
            nickname: config.nickname,
        });
        players[player.id] = player;
    });
    socket.on('movement', function(movement) {
        if(!player || player.health===0){return;}
        player.movement = movement;
    });
    socket.on('shoot', function(){
        console.log('shoot');
        if(!player || player.health===0){return;}
        player.shoot();
    });
    socket.on('disconnect', () => {
        if(!player){return;}
        delete players[player.id];
        player = null;
    });
});


// フレーム処理（30fps）
setInterval(() => {
    Object.values(players).forEach((player) => {
        const movement = player.movement;
        if(movement.forward){
            player.move(5);
        }
        if(movement.back){
            player.move(-5);
        }
        if(movement.left){
            player.angle -= 0.1;
        }
        if(movement.right){
            player.angle += 0.1;
        }
    });
    Object.values(bullets).forEach((bullet) =>{
        if(! bullet.move(10)){
            bullet.remove();
            return;
        }
        Object.values(players).forEach((player) => {
           if(bullet.intersect(player)){
               if(player !== bullet.player){
                   player.damage();
                   bullet.remove();
                   bullet.player.point += 1;
               }
           } 
        });
        Object.values(walls).forEach((wall) => {
           if(bullet.intersect(wall)){
               bullet.remove();
           }
        });
    });
    io.sockets.emit('state', players, bullets, walls);
}, 1000/30);

// path 適正化
app.use('/static', express.static(__dirname + '/static'));
app.use('/pics',   express.static(__dirname + '/pics'));
app.use('/sounds', express.static(__dirname + '/sounds'));

app.get('/', (request, response) => {
  response.sendFile(path.join(__dirname, '/static/index.html'));
});

// ポート番号：3000で待機
server.listen(3000, function() {
  console.log('Starting server on port 3000');
});
