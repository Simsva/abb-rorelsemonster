let time_now = () => performance.now();

let ui_objs = [], obj_next_id = 1;
class UIObject {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.id = obj_next_id++;
    ui_objs.push(this);
  }

  destroy() {
    const i = ui_objs.map(o => o.id).indexOf(this.id);
    if(i !== -1) ui_objs.splice(i, 1);
  }

  is_inside(x, y) {
    return x < (this.x+this.w)
        && x > this.x
        && y < (this.y+this.h)
        && y > this.y;
  }

  logic(ctx, cw, ch) {}
  render(ctx, cw, ch) {}
  click(opts) {}
  hover() {}
}

class Library extends UIObject {
  constructor(x, y, w, h, r) {
    super(x, y, w, h);
    this.r = r;
  }

  render(ctx, cw, ch) {
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.ellipse(this.x+this.w/2, this.y+this.h/2, this.r, this.r, 0, 0, 2*Math.PI);
    ctx.fill();
  }
}

class Timers extends UIObject {
  constructor(font, style, offset) {
    super(0, 0, 0, 0);
    this.font = font;
    this.style = style;
    this.off= offset;

    this.fps = "";
    this.fps_m = null;
    this.ups = "";
    this.ups_m = null;
  }

  logic(ctx, cw, ch) {
    this.fps = `MSPT:${Math.round(mspt, 2).toString().padStart(3)}`;
    this.fps_m = ctx.measureText(this.fps);
    this.ups = `MSPU:${Math.round(mspu, 2).toString().padStart(3)}`;
    this.ups_m = ctx.measureText(this.ups);
  }

  render(ctx, cw, ch) {
    ctx.font = this.font;
    ctx.fillStyle = this.style;

    /* FIXME: calculations break on descenders */
    let fps_h = font_height(this.fps_m) + this.off,
        ups_h = font_height(this.ups_m) + this.off,
        fps_x = cw - this.fps_m.width - this.off,
        ups_x = cw - this.ups_m.width - this.off;
    ctx.fillText(this.fps, fps_x, fps_h);
    ctx.fillText(this.ups, ups_x, fps_h+ups_h);

    this.w = Math.max(this.fps_m.width, this.ups_m.width) + 2*this.off;
    this.h = fps_h + ups_h + this.off;
    this.x = Math.min(fps_x, ups_x) - this.off;
    this.y = 0;
  }

  click(opts) {
    console.log(opts);
  }
}

/* utils */
let font_height = (tm) => tm.actualBoundingBoxAscent - tm.actualBoundingBoxDescent;

/* data */
let c_x, c_y, r;
let libs = [];
let m_x = 0, m_y = 0;
let render_bboxes = true;

let mouse_move = (e) => {
  m_x = e.offsetX;
  m_y = e.offsetY;
}

let mouse_down = (e) => {
  let opts = {
    alt: e.altKey,
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    shift: e.shiftKey,
    button: e.button,
    buttons: e.buttons,
  };

  for(let obj of ui_objs) {
    if(obj.is_inside(e.offsetX, e.offsetY))
      obj.click(opts);
  }
}

let canvas_arrow = (ctx, fromx, fromy, tox, toy, w) => {
  let headlen = 10; // length of head in pixels
  let dx = tox - fromx;
  let dy = toy - fromy;
  let angle = Math.atan2(dy, dx);
  let old_width = ctx.lineWidth;

  ctx.beginPath();

  ctx.lineWidth = w;
  ctx.moveTo(fromx, fromy);
  ctx.lineTo(tox, toy);
  ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(tox, toy);
  ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));

  ctx.stroke();

  ctx.lineWidth = old_width;
}

/* events */
let render_begin = (ctx, canvas) => {
  c_x = canvas.width / 2;
  c_y = canvas.height / 2;
  r = canvas.height / 3;

  new Timers("20px mono", "black", 5);

  let lib_n = 6;
  for(let i = 0; i < lib_n; i++) {
    let x = c_x - r*Math.cos(2*Math.PI*i/lib_n),
        y = c_y - r*Math.sin(2*Math.PI*i/lib_n),
        lib_r = 10;
    libs.push(new Library(x-lib_r, y-lib_r, 2*lib_r, 2*lib_r, lib_r));
  }
}

let mspt = 0, mspu = 0;
let last_render = 0;
let render_loop = (ctx, canvas) => {
  let now = time_now();
  mspt = now - last_render;
  last_render = now;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  /* border */
  ctx.strokeStyle = "black";
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.stroke();

  /* render objects */
  for(let obj of ui_objs) {
    obj.render(ctx, canvas.width, canvas.height);
    if(render_bboxes) {
      ctx.strokeStyle = "red";
      ctx.beginPath();
      ctx.rect(obj.x, obj.y, obj.w, obj.h);
      ctx.stroke();
    }
  }
}

let last_logic = 0;
let logic_loop = (ctx, canvas) => {
  let now = time_now();
  mspu = now - last_logic;
  last_logic = now;

  for(let obj of ui_objs) obj.logic(ctx, canvas.width, canvas.height);
}

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");

  canvas.addEventListener("mousemove", mouse_move);
  canvas.addEventListener("mousedown", mouse_down);

  render_begin(ctx, canvas);
  let render_interval = setInterval(render_loop, 1000/60, ctx, canvas);
  let logic_interval = setInterval(logic_loop, 0, ctx, canvas);
});
