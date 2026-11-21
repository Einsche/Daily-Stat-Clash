'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {makeGame,ApiError} = require('./game.js');

const ROOT = '/Daily-Stat-Clash';
const API = ROOT + '/api';
const PROJECT_DIR = path.resolve(__dirname,'..');
const STATIC_DIR = path.join(PROJECT_DIR,'web');
const PORTRAIT_DIR = path.join(PROJECT_DIR,'app/public/assets/portraits');

function createApp({game = makeGame(), allowedOrigin = process.env.PUBLIC_WEB_ORIGIN || ''}={}) {
  const throttle = new Map();
  const gc = setInterval(() => {
    try {game.cleanup();} catch(error) {console.error('Session cleanup failed',error);}
    const now = Date.now();
    for (const [key,record] of throttle) if (now-record.windowStart > record.window) throttle.delete(key);
  }, 5*60*1000);
  gc.unref();
  const midnight = setInterval(() => {
    try {game.settlePending();} catch(error) {console.error('Midnight settlement failed',error);}
  }, 15*1000);
  midnight.unref();

  function json(res,status,value) {
    res.writeHead(status, {
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store'
    });
    res.end(JSON.stringify(value));
  }
  function tokenFrom(req) {
    const header = req.headers.authorization || '';
    return header.startsWith('Bearer ') ? header.slice(7) : null;
  }
  function rateLimit(req,action,max,windowMs) {
    const remote = req.socket.remoteAddress || 'unknown';
    const key=action+':'+remote;
    const now=Date.now();
    let record=throttle.get(key);
    if (!record || now-record.windowStart>windowMs) {
      record={windowStart:now,window:windowMs,count:0};
      throttle.set(key,record);
    }
    record.count++;
    if(record.count>max) throw new ApiError(429,'Too many requests. Please try again later.');
  }
  async function readJson(req) {
    const chunks=[];
    let total=0;
    for await (const chunk of req) {
      total+=chunk.length;
      if(total>4096) throw new ApiError(413,'Request is too large.');
      chunks.push(chunk);
    }
    if(!chunks.length)return {};
    try {
      const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!value || typeof value!=='object' || Array.isArray(value))throw Error();
      return value;
    } catch {throw new ApiError(400,'Invalid JSON object.');}
  }
  function serveFile(res,filename,type) {
    const bytes=fs.readFileSync(filename);
    res.writeHead(200,{
      'Content-Type':type,
      'Cache-Control':type.includes('text/html') || filename.endsWith('/config.js')
        ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600',
      'Content-Length':bytes.length
    });
    res.end(bytes);
  }
  async function handler(req,res) {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',
      "default-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; " +
      "script-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'");
    try {
      if(!req.url || !req.method)throw new ApiError(400,'Malformed request.');
      const url=new URL(req.url,'http://localhost');
      const endpoint=url.pathname;

      if(endpoint.startsWith(API)) {
        const origin=req.headers.origin;
        if(origin) {
          let allowed=false;
          try {allowed=new URL(origin).host===req.headers.host || origin===allowedOrigin;}
          catch {allowed=false;}
          if(!allowed)throw new ApiError(403,'Origin not allowed.');
          res.setHeader('Access-Control-Allow-Origin',origin);
          res.setHeader('Vary','Origin');
          res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
          res.setHeader('Access-Control-Max-Age','600');
        }
        if(req.method==='OPTIONS') {
          res.writeHead(204);res.end();return;
        }
        if(req.method==='GET' && endpoint===API+'/health') {
          json(res,200,{ok:true,service:'daily-stat-clash',backend:'sqlite'});return;
        }
        if(req.method==='GET' && endpoint===API+'/state') {
          const provided=tokenFrom(req);
          if(provided && !game.getUser(provided))throw new ApiError(401,'Session expired. Please sign in again.');
          json(res,200,game.state(provided));return;
        }
        if(req.method==='GET' && endpoint===API+'/leaderboard') {
          json(res,200,game.leaderboard(url.searchParams.get('period') || 'weekly'));return;
        }
        if(req.method!=='POST')throw new ApiError(405,'Method not allowed.');
        const data=await readJson(req);
        if(endpoint===API+'/auth/register') {
          rateLimit(req,'register',8,60*60*1000);
          json(res,201,await game.register(data.username,data.password));return;
        }
        if(endpoint===API+'/auth/login') {
          rateLimit(req,'login',60,15*60*1000);
          json(res,200,await game.login(data.username,data.password));return;
        }
        const token=tokenFrom(req);
        if(endpoint===API+'/auth/logout') {
          json(res,200,game.logout(token));return;
        }
        if(endpoint===API+'/draw') {json(res,200,game.draw(token));return;}
        if(endpoint===API+'/assign') {json(res,200,game.assign(token,data.stat));return;}
        if(endpoint===API+'/submit') {json(res,200,game.submit(token));return;}
        throw new ApiError(404,'Unknown API endpoint.');
      }
      if(req.method!=='GET' && req.method!=='HEAD')throw new ApiError(405,'Method not allowed.');
      if(endpoint==='/') {
        res.writeHead(302,{Location:ROOT+'/'});res.end();return;
      }
      if(endpoint===ROOT || endpoint===ROOT+'/' || endpoint===ROOT+'/index.html') {
        serveFile(res,path.join(STATIC_DIR,'index.html'),'text/html; charset=utf-8');return;
      }
      const portraitPrefix=ROOT+'/app/public/assets/portraits/';
      if(endpoint.startsWith(portraitPrefix)) {
        const filename=endpoint.slice(portraitPrefix.length);
        if(!/^[a-z0-9-]+\.svg$/.test(filename))throw new ApiError(404,'Not found.');
        const location=path.join(PORTRAIT_DIR,filename);
        if(!fs.existsSync(location))throw new ApiError(404,'Not found.');
        serveFile(res,location,'image/svg+xml');return;
      }
      const files={
        [ROOT+'/app.js']:['app.js','text/javascript; charset=utf-8'],
        [ROOT+'/config.js']:['config.js','text/javascript; charset=utf-8'],
        [ROOT+'/guest-roster.json']:['guest-roster.json','application/json; charset=utf-8'],
        [ROOT+'/styles.css']:['styles.css','text/css; charset=utf-8'],
        [ROOT+'/favicon.svg']:['favicon.svg','image/svg+xml']
      };
      const entry=files[endpoint];
      if(entry) {serveFile(res,path.join(STATIC_DIR,entry[0]),entry[1]);return;}
      throw new ApiError(404,'Not found.');
    } catch(error) {
      if(!(error instanceof ApiError))console.error('Request error',error);
      const status=error instanceof ApiError ? error.status : 500;
      if(!res.headersSent)json(res,status,{error:status===500?'Internal server error.':error.message});
      else res.end();
    }
  }
  const server=http.createServer(handler);
  server.on('close',()=>{clearInterval(gc);clearInterval(midnight);});
  return {server,game};
}
if(require.main===module) {
  if(process.env.NODE_ENV==='production' && !process.env.DB_PATH) {
    console.error('DB_PATH is required in production; attach persistent storage.');
    process.exit(1);
  }
  const {server}=createApp();
  const port=Number(process.env.PORT||3000);
  server.listen(port,'0.0.0.0',()=>{
    console.log('Daily Stat Clash listening on '+port+' with persistent SQLite backend.');
  });
}
module.exports={createApp,ROOT,API};
