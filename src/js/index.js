let time_now = () => performance.now();

let ui_objs = [], obj_next_id = 1;
class UIObject {
  constructor(x, y, w, h, global=true) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this._id = obj_next_id++;
    this._alive = true;
    this._subobjs = [];
    this._global = global;
    if(this._global) ui_objs.push(this);
  }

  destroy() {
    this._alive = false;
    if(this._global) {
      const i = ui_objs.map(o => o._id).indexOf(this._id);
      if(i !== -1) ui_objs.splice(i, 1);
    }
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

class _TextObject extends UIObject {
  constructor(x, y, w, h, text, font, style) {
    super(x, y, w, h, false);

    this.text = text;
    this.font = font;
    this.style = style;
  }

  render(ctx, cw, ch) {
    ctx.font = this.font;
    ctx.fillStyle = this.style;

    ctx.fillText(this.text, this.x, this.y+this.h);
  }
}

class TextBox extends UIObject {
  constructor(x, y, text_objs, border_style, margin, permanent=true) {
    super(x, y, 0, 0);

    this.tos = text_objs;
    this.bstyle = border_style;
    this.margin = margin;
    this.permanent = permanent;
  }

  logic(ctx, cw, ch) {
    /* FIXME: REALLY inefficient */
    this._subobjs.forEach(o => o.destroy());
    this._subobjs = [];
    this.lh = [0]; this.lw = [0];
    let line = 0, margin = 0;

    /* calculate all offsets */
    this.tms = this.tos.map(t => {
      switch(t.type) {
        case "lf":
          this.lh[line++] += margin;
          margin = t.margin;
          this.lw[line] = 0;
          this.lh[line] = 0;
          return null;

        case "text":
          ctx.font = t.font;
          let tm = ctx.measureText(t.text);
          let th = text_height(tm);

          this.lw[line] += tm.width;
          this.lh[line] = Math.max(this.lh[line], th);
          return { w: tm.width, h: th, l: line, };
      }
    });

    this.w = Math.max(...this.lw) + 2*this.margin;
    this.h = this.lh.reduce((a, b) => a+b) + 2*this.margin;

    /* create all subobjects */
    let cur_w = 0, cur_h = this.lh[0];
    line = 0;
    for(let i = 0; i < this.tos.length; i++) {
      const t = this.tos[i], tm = this.tms[i];
      switch(t.type) {
        case "lf":
          cur_w = 0;
          cur_h += this.lh[++line];
          continue;

        case "text":
          let so_i = this._subobjs.push(new _TextObject(
            this.x+this.margin + cur_w,
            this.y+this.margin + cur_h-tm.h,
            tm.w, tm.h,
            t.text, t.font, t.style,
          )) - 1;
          if(t.click) this._subobjs[so_i].click = t.click;
          if(t.hover) this._subobjs[so_i].hover = t.hover;
          cur_w += tm.w;
          break;
      }
    }
  }

  render(ctx, cw, ch) {
    /* All rendering is done in subobjects */
  }

  click(opts) {
    switch(opts.button) {
      case 0:
        if(!this.permanent) this.destroy();
        break;
    }
  }
}

class Timers extends UIObject {
  constructor(font, style, offset) {
    super(0, 0, 0, 0);
    this.font = font;
    this.style = style;
    this.off = offset;
    this.enabled = true;

    this.fps = "";
    this.fps_m = null;
    this.ups = "";
    this.ups_m = null;
  }

  logic(ctx, cw, ch) {
    ctx.font = this.font;
    this.fps = `MSPT:${Math.round(mspt, 2).toString().padStart(3)}`;
    this.fps_m = ctx.measureText(this.fps);
    this.ups = `MSPU:${Math.round(mspu, 2).toString().padStart(3)}`;
    this.ups_m = ctx.measureText(this.ups);
  }

  render(ctx, cw, ch) {
    let fps_h = text_height(this.fps_m) + this.off,
        ups_h = text_height(this.ups_m) + this.off,
        fps_x = cw - this.fps_m.width - this.off,
        ups_x = cw - this.ups_m.width - this.off;

    if(this.enabled) {
      ctx.font = this.font;
      ctx.fillStyle = this.style;

      ctx.fillText(this.fps, fps_x, fps_h);
      ctx.fillText(this.ups, ups_x, fps_h+ups_h);
    }

    this.w = Math.max(this.fps_m.width, this.ups_m.width) + 2*this.off;
    this.h = fps_h + ups_h + this.off;
    this.x = Math.min(fps_x, ups_x) - this.off;
    this.y = 0;
  }

  click(opts) {
    switch(opts.button) {
      case 0:
        this.enabled = !this.enabled;
        break;

      case 2:
        render_bboxes = !render_bboxes;
        break;
    }
  }
}

/* globals */
let m_x = 0, m_y = 0;
let render_bboxes = true;
let mspt = 0, mspu = 0;

let libs = [];
let c_x, c_y, r;

/* utils */
let text_height = (tm) => tm.actualBoundingBoxAscent; //+ tm.actualBoundingBoxDescent;

let Text = {
  t(text, font, style) {
    return { type: "text", text: text, font: font, style: style, };
  },
  c(text, font, style, click) {
    return { type: "text", text: text, font: font, style: style, click: click, };
  },
  lf(margin=0) {
    return { type: "lf", margin: margin, };
  },
};

let render_bbox = (obj, ctx, style) => {
  ctx.strokeStyle = style;
  ctx.beginPath();
  ctx.rect(obj.x, obj.y, obj.w, obj.h);
  ctx.stroke();
};

/* events */
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

  ui_objs.filter(o => o.is_inside(e.offsetX, e.offsetY)).forEach(o => {
    o.click(opts);
    o._subobjs
     .filter(so => so.is_inside(e.offsetX, e.offsetY))
     .forEach(so => so.click(opts));
  });
}

/* functions */
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

  new TextBox(50, 50, [
    Text.t("Hello world ", "30px sans", "green"),
    Text.t("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "30px sans", "red"),
    Text.lf(15),
    Text.c("hejehe", "20px serif", "blue", (opts) => {
      console.log(opts);
    }),
    Text.lf(),
    Text.t("bruh", "50px mono", "black"),
    Text.t("This is a text box.", "30px sans", "orange"),
  ], "transparent", 0);
}

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
  /* TODO: render deeper subobjects */
  ui_objs.forEach(o => {
    o.render(ctx, canvas.width, canvas.height);
    o._subobjs.forEach(so => so.render(ctx, canvas.width, canvas.height));
    if(render_bboxes) {
      render_bbox(o, ctx, "red");
      o._subobjs.forEach(so => render_bbox(so, ctx, "green"));
    }
  });
}

let last_logic = 0;
let logic_loop = (ctx, canvas) => {
  let now = time_now();
  mspu = now - last_logic;
  last_logic = now;

  ui_objs.forEach(o => {
    o.logic(ctx, canvas.width, canvas.height);
    o._subobjs.forEach(so => so.logic(ctx, canvas.width, canvas.height));
  });
}

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");

  canvas.addEventListener("mousemove", mouse_move);
  canvas.addEventListener("mousedown", mouse_down);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  render_begin(ctx, canvas);
  let render_interval = setInterval(render_loop, 1000/60, ctx, canvas);
  let logic_interval = setInterval(logic_loop, 0, ctx, canvas);
});
