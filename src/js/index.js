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

  is_alive() {
    return this._alive;
  }

  id() {
    return this._id;
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
  constructor(x, y, w, h, name, r) {
    super(x, y, w, h);
    this.name = name;
    this.r = r;
    this.tb = null;
  }

  logic(ctx, cw, ch) {
    if(this.tb && this.tb.is_alive()) {
      this.tb.x = this.x - (this.tb.w - this.w)/2;
      this.tb.y = this.y - this.tb.h - 5;
    }
  }

  render(ctx, cw, ch) {
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.ellipse(this.x+this.w/2, this.y+this.h/2, this.r, this.r, 0, 0, 2*Math.PI);
    ctx.fill();
  }

  click(opts) {
    if(this.tb && this.tb.is_alive()) {
      this.tb.destroy();
    } else {
      this.tb = new TextBox(this.x, this.y, [
        Text.t(this.name, "30px sans", "black"),
      ], "black", 5);

      this.tb.click = (opts) => {
        if(opts.button == 0) {
          this.tb.destroy();
        }
      }
    }
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
  constructor(x, y, text_objs, border_style, margin) {
    super(x, y, 0, 0);

    this.tos = text_objs;
    this.bstyle = border_style;
    this.margin = margin;
  }

  logic(ctx, cw, ch) {
    /* FIXME: REALLY inefficient */
    this._subobjs.forEach(o => o.destroy());
    this._subobjs = [];
    this.lh = [0]; this.lw = [0];
    let line = 0, lfmargin = 0;

    /* calculate all offsets */
    this.tms = this.tos.map(t => {
      switch(t.type) {
        case "lf":
          this.lh[line++] += lfmargin;
          lfmargin = t.margin;
          this.lw[line] = 0;
          this.lh[line] = 0;
          return null;

        case "vartext":
        case "text":
          const T = t.type === "text" ? t : t.get();
          ctx.font = T.font;
          let tm = ctx.measureText(T.text);
          let th = text_height(tm);

          this.lw[line] += tm.width;
          this.lh[line] = Math.max(this.lh[line], th);
          return { w: tm.width, h: th, l: line, };
      }
    });
    /* add last margign */
    this.lh[line] += lfmargin;

    this.w = Math.max(...this.lw) + 2*this.margin;
    this.h = this.lh.reduce((a, b) => a+b) + 2*this.margin;

    /* create all subobjects */
    /* FIXME: respawning all objects increases id count fast */
    let cur_w = 0, cur_h = this.lh[0];
    line = 0;
    for(let i = 0; i < this.tos.length; i++) {
      const t = this.tos[i], tm = this.tms[i];
      switch(t.type) {
        case "lf":
          cur_w = 0;
          cur_h += this.lh[++line];
          continue;

        case "vartext":
        case "text":
          const T = t.type === "text" ? t : t.get();
          let so_i = this._subobjs.push(new _TextObject(
            this.x+this.margin + cur_w,
            this.y+this.margin + cur_h-tm.h,
            tm.w, tm.h,
            T.text, T.font, T.style,
          )) - 1;
          if(T.click) this._subobjs[so_i].click = T.click;
          if(T.hover) this._subobjs[so_i].hover = T.hover;
          cur_w += tm.w;
          break;
      }
    }
  }

  render(ctx, cw, ch) {
    render_bbox(this, ctx, this.bstyle);
  }
}

/* globals */
let m_x = 0, m_y = 0;
let render_bboxes = true, render_timers = true;
let mspt = 0, mspu = 0;

let libs = [];

/* UI elements */
let timers_tb;

/* utils */
let text_height = (tm) => tm.actualBoundingBoxAscent; //+ tm.actualBoundingBoxDescent;

let Text = {
  t(text, font, style, click=null, hover=null) {
    return { type: "text", text: text, font: font,
             style: style, click: click, hover: hover, };
  },
  vt(get) {
    return { type: "vartext", get: get, };
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
  timers_tb = new TextBox(0, 0, [
    Text.vt(() => {
      return {
        text: `MSPT:${Math.round(mspt, 2).toString().padStart(3)}`,
        font: "20px mono", style: render_timers ? "black" : "transparent",
      };
    }),
    Text.lf(5),
    Text.vt(() => {
      return {
        text: `MSPU:${Math.round(mspu, 2).toString().padStart(3)}`,
        font: "20px mono", style: render_timers ? "black" : "transparent",
      };
    }),
  ], "transparent", 5);

  timers_tb.click = (opts) => {
    switch(opts.button) {
      case 0:
        render_timers = !render_timers;
        break;

      case 2:
        render_bboxes = !render_bboxes;
        break;
    }
  };

  let c_x = canvas.width / 2,
      c_y = canvas.height / 2,
      r = canvas.height / 3;

  let lib_n = 6;
  for(let i = 0; i < lib_n; i++) {
    let x = c_x - r*Math.cos(2*Math.PI*i/lib_n),
        y = c_y - r*Math.sin(2*Math.PI*i/lib_n),
        lib_r = 10;
    libs.push(new Library(x-lib_r, y-lib_r, 2*lib_r, 2*lib_r, `Lib_${i}`, lib_r));
  }

  // new TextBox(50, 50, [
  //   Text.t("Hello world ", "30px sans", "green"),
  //   Text.t("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "30px sans", "red"),
  //   Text.lf(15),
  //   Text.t("hejehe", "20px serif", "blue", (opts) => {
  //     console.log(opts);
  //   }),
  //   Text.lf(10),
  //   Text.vt(() => {
  //     return {
  //       text: `MSPT:${Math.round(mspt, 2).toString().padStart(3)}`,
  //       font: "20px mono", style: "black",
  //     };
  //   }),
  //   Text.t("This is a text box.", "30px sans", "orange"),
  // ], "transparent", 0);
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

  timers_tb.x = canvas.width - timers_tb.w;
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
