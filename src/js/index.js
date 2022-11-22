let time_now = () => performance.now();

let ui_objs = [], obj_next_id = 1;
class UIObject {
  constructor(x, y, w, h, angle=0, global=true) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.rot = angle;

    this._id = obj_next_id++;
    this._alive = true;
    this._enabled = true;
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

  is_enabled() {
    return this._enabled;
  }

  id() {
    return this._id;
  }

  is_inside(x, y) {
    let nx = this.x + (x-this.x)*Math.cos(this.rot) + (y-this.y)*Math.sin(this.rot),
        ny = this.y + (y-this.y)*Math.cos(this.rot) - (x-this.x)*Math.sin(this.rot);
    return nx < (this.x+this.w)
        && nx > this.x
        && ny < (this.y+this.h)
        && ny > this.y;
  }

  logic(ctx, cw, ch) {}
  render(ctx, cw, ch) {}
  click(opts) {}
  hover() {}
}

class Library extends UIObject {
  constructor(x, y, r, name) {
    super(x-r, y-r, 2*r, 2*r);
    this.name = name;
    this.r = r;

    /* text box */
    this.tb = new TextBox(this.x, this.y, [
      Text.t(this.name, "30px sans", "black"),
    ], "black", "white", 5, false);
    this.tb.click = (opts) => {
      if(opts.button == 0) this.tb._enabled = !this.tb._enabled;
    };
    this.tb._enabled = false;
    this._subobjs.push(this.tb);
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
    ctx.ellipse(this.x+this.w/2, this.y+this.h/2,
                this.r, this.r, 0, 0, 2*Math.PI);
    ctx.fill();
  }

  click(opts) {
    if(opts.button == 0) this.tb._enabled = !this.tb._enabled;
  }
}

class Arrow extends UIObject {
  constructor(fromx, fromy, tox, toy, width, head_percent, line_width, style, text_objs, global=true) {
    /* NOTE: Y+ downwards and clockwise rotation was a mistake */
    let dx = tox-fromx, dy = toy-fromy,
        rot = -Math.PI/2 + Math.atan2(dy, dx),
        rrot = Math.atan2(dy, -dx);
    super(-width/2*Math.sin(rrot)+fromx,
          -width/2*Math.cos(rrot)+fromy,
          width, Math.sqrt(dx*dx + dy*dy),
          rot, global);

    this.rrot = rrot;
    this.fromx = fromx;
    this.fromy = fromy;
    this.tox = tox;
    this.toy = toy;
    this.headp = head_percent;
    this.style = style;
    this.linew = line_width;

    this.tb = new TextBox(0,0, text_objs, style, "white", 3, false);
    this.tb.click = (opts) => {
      console.log("hejee");
      this.tb._enabled = !this.tb._enabled;
    };
    this.tb._enabled = false;
    this._subobjs.push(this.tb);
  }

  logic(ctx, cw, ch) {
    let dx = this.tox-this.fromx, dy = this.toy-this.fromy;

    this.x = -this.w/2*Math.sin(this.rrot) + this.fromx;
    this.y = -this.w/2*Math.cos(this.rrot) + this.fromy;
    this.h = Math.sqrt(dx*dx + dy*dy);

    this.headx = this.tox - dx*this.headp;
    this.heady = this.toy - dy*this.headp;

    this.tb.x = this.fromx + dx/2 - this.tb.w/2;
    this.tb.y = this.fromy + dy/2 - this.tb.h/2;
  }

  render(ctx, cw, ch) {
    ctx.strokeStyle = this.style;
    ctx.lineWidth = this.linew;
    ctx.beginPath();

    ctx.moveTo(this.fromx, this.fromy);
    ctx.lineTo(this.tox, this.toy);

    /* NOTE: this is needed to avoid sharp corners,
     *       no clue why */
    ctx.moveTo(this.tox, this.toy);
    ctx.lineTo(this.headx - this.w/2 * Math.sin(this.rrot),
               this.heady - this.w/2 * Math.cos(this.rrot));

    ctx.moveTo(this.tox, this.toy);
    ctx.lineTo(this.headx + this.w/2 * Math.sin(this.rrot),
               this.heady + this.w/2 * Math.cos(this.rrot));
    ctx.stroke();
  }

  click(opts) {
    this.tb._enabled = !this.tb._enabled;
  }
}

class _TextObject extends UIObject {
  constructor(x, y, w, h, parent, text, font, style) {
    super(x, y, w, h, 0, false);

    this.parent = parent;
    this.text = text;
    this.font = font;
    this.style = style;
  }

  render(ctx, cw, ch) {
    ctx.font = this.font;
    ctx.fillStyle = this.style;

    ctx.fillText(this.text, this.x, this.y+this.h);
  }

  click(opts) {
    this.parent.click(opts);
    if(this._click) this._click(opts);
  }

  hover() {
    this.parent.hover();
    if(this._hover) this._hover();
  }
}

class TextBox extends UIObject {
  constructor(x, y, text_objs, border_style, bg_style, margin, global=true) {
    super(x, y, 0, 0, 0, global);

    this.tos = text_objs;
    this.bstyle = border_style;
    this.bgstyle = bg_style;
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
            this,
            T.text, T.font, T.style,
          )) - 1;
          if(T.click) this._subobjs[so_i]._click = T.click;
          if(T.hover) this._subobjs[so_i]._hover = T.hover;
          cur_w += tm.w;
          break;
      }
    }
  }

  render(ctx, cw, ch) {
    ctx.fillStyle = this.bgstyle;
    ctx.beginPath();
    ctx.rect(this.x, this.y, this.w, this.h);
    ctx.fill();
    render_bbox(this, ctx, this.bstyle);
  }
}

/* globals */
let m_x = 0, m_y = 0;
let cw = 0, ch = 0;
let render_bboxes = true, render_timers = true;
let bbox_colors = ["red", "green", "blue"];
let mspf = 0, mspu = 0;

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
  ctx.lineWidth = 1;
  ctx.beginPath();
  // ctx.rect(obj.x, obj.y, obj.w, obj.h);
  ctx.moveTo(obj.x, obj.y);
  ctx.lineTo(obj.x + obj.w * Math.cos(obj.rot),
             obj.y + obj.w * Math.sin(obj.rot));
  ctx.lineTo(obj.x + obj.w * Math.cos(obj.rot) - obj.h * Math.sin(obj.rot),
             obj.y + obj.w * Math.sin(obj.rot) + obj.h * Math.cos(obj.rot));
  ctx.lineTo(obj.x - obj.h * Math.sin(obj.rot),
             obj.y + obj.h * Math.cos(obj.rot));
  ctx.lineTo(obj.x, obj.y);
  ctx.stroke();
};

/* events */
let mouse_move = (e) => {
  m_x = e.offsetX;
  m_y = e.offsetY;
};

let mouse_down = (e) => {
  let opts = {
    alt: e.altKey,
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    shift: e.shiftKey,
    button: e.button,
    buttons: e.buttons,
  };

  let last_obj;
  for_all_objs_l(ui_objs, (o, depth, {x, y}) => {
    if(o.is_inside(x, y))
      last_obj = o;
      // o.click(opts);
  }, {x: e.offsetX, y: e.offsetY});

  /* only click on the top visible object */
  if(last_obj) last_obj.click(opts);
};

/* functions */
let for_all_objs = (objs, callback, args, depth=0) => {
  objs.filter(o => o.is_enabled()).forEach((o) => {
    callback(o, depth, args);
    for_all_objs(o._subobjs, callback, args, depth+1);
  });
};

/* same as for_all_objs, but respects layers */
let for_all_objs_l = (objs, callback, args, depth=0) => {
  let subobjs = [];
  /* TODO: sort by z-layer */
  objs.filter(o => o.is_enabled()).forEach((o) => {
    callback(o, depth, args);
    subobjs.push(...o._subobjs);
  });
  /* always handle subobjects "one layer above" other objects */
  if(subobjs.length > 0)
    for_all_objs(subobjs, callback, args, depth+1);
};

let arrow_between = (lib1, lib2, lw, text_objs) => {
  let fx = lib1.x + lib1.w/2,
      fy = lib1.y + lib1.h/2,
      tx = lib2.x + lib2.w/2,
      ty = lib2.y + lib2.h/2,
      rot = Math.atan2(ty-fy, tx-fx);

  let r1 = 1.5*lib1.r, r2 = 1.5*lib2.r;
  let fx2 = fx + r1*Math.cos(rot),
      fy2 = fy + r1*Math.sin(rot),
      tx2 = tx - r2*Math.cos(rot),
      ty2 = ty - r2*Math.sin(rot);

  let dx = tx2 - fx2,
      dy = ty2 - fy2,
      l = Math.sqrt(dx*dx + dy*dy);

  let w = 0.06125*l, off = 0.6*w;

  return new Arrow(
    fx2 - off*Math.sin(rot),
    fy2 + off*Math.cos(rot),
    tx2 - off*Math.sin(rot),
    ty2 + off*Math.cos(rot),
    w, 0.1, lw,
    "black", text_objs
  );
};

/* NOTE: should be replaced with an actual API call in production */
let get_libraries = async () => {
  let r = await fetch("https://simsva.se/koha_test/index.php", {
    method: "POST",
    headers: [["Content-Type", "application/json"]],
    body: JSON.stringify({
      /* NOTE: joining with branches for branchname takes forever */
      query: `SELECT DISTINCT bt.tobranch AS b #, br.branchname AS n
FROM branchtransfers AS bt
#LEFT JOIN branches AS br
#ON bt.tobranch = br.branchcode
UNION
SELECT DISTINCT bt.frombranch AS b #, br.branchname AS n
FROM branchtransfers AS bt;
#LEFT JOIN branches AS br
#ON bt.frombranch = br.branchcode;`,
    }),
  });
  return await r.json();
};

let get_transfers = async (from, to, after, before) => {
  let r = await fetch("https://simsva.se/koha_test/index.php", {
    method: "POST",
    headers: [["Content-Type", "application/json"]],
    body: JSON.stringify({
      query: `SELECT COUNT(*) AS c
FROM branchtransfers
WHERE frombranch = '${from}'
AND tobranch = '${to}'
AND datesent
  BETWEEN '${after}'
      AND '${before}';`
    }),
  });
  let j = await r.json();
  return parseInt(j[0].c);
};

let lib_objs = {}, arrow_objs = {};
let refresh_libs = async () => {
  let libs_p = get_libraries();
  let after  = document.getElementById("date_after").value,
      before = document.getElementById("date_before").value;
  if(after == "") after = "2020-01-01";
  if(before == "") before = "2021-01-01";

  for(const k in lib_objs) {
    lib_objs[k].destroy();
  }
  for(const k in arrow_objs) {
    arrow_objs[k].destroy();
  }
  lib_objs = {}; arrow_objs = {};

  let cx = cw/2,   cy = ch/2,
      r1 = ch/2.3, r2 = ch/2.3,
      lib_r = 10, libs = await libs_p;

  lib_objs["VASB"] = new Library(cx, cy, lib_r*5, "VASB");

  let libs_out = [], arrows_out = {},
      max_tr = 0;
  /* calculate which libraries and arrows need to be rendered */
  let trs = libs
      .filter(o => o.b !== "VASB" && o.b != undefined)
      /* all transfers are to/from VASB */
      .map(o => {
        return {
          code: o.b,
          from: get_transfers(o.b, "VASB", after, before),
          to: get_transfers("VASB", o.b, after, before),
        };
      });
  console.log(trs);
  for(const o of libs) {
    let lib = o.b;

    let promises = trs.filter(o => o.code === lib);
    if(promises.length === 0) continue;
    let [to, from] = await Promise.all([
      promises[0].to,
      promises[0].from,
    ]);

    if(from > 0) arrows_out[`${lib}/VASB`] = from;
    if(to > 0) arrows_out[`VASB/${lib}`] = to;
    if(from > 0 || to > 0) libs_out.push(lib);
    max_tr = Math.max(max_tr, to, from);
  }

  let lib_n = libs_out.length,
      angle = 2*Math.PI/lib_n;
  for(let i = 0; i < lib_n; i++) {
    let lib = libs_out[i],
        x = cx + r1*Math.cos(i*angle),
        y = cy + r2*Math.sin(i*angle);
    lib_objs[lib] = new Library(x, y, lib_r, lib);
  }

  const max_width = 5;
  for(const key in arrows_out) {
    let [l1, l2] = key.split("/"),
        tr = arrows_out[key];
    arrow_objs[key] = arrow_between(
      lib_objs[l1], lib_objs[l2], Math.round(1 + (max_width-1) * tr/max_tr),
      [Text.t(`${tr}`, "20px sans", "black")],
    );
  }
};

/* events */
let render_begin = (ctx, canvas) => {
  timers_tb = new TextBox(0, 0, [
    Text.vt(() => {
      return {
        text: `MSPF:${Math.round(mspf, 2).toString().padStart(3)}`,
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
  ], "transparent", "white", 5);

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

  /* run once on start */
  refresh_libs();

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
  //       text: `MSPF:${Math.round(mspf, 2).toString().padStart(3)}`,
  //       font: "20px mono", style: "black",
  //     };
  //   }),
  //   Text.t("This is a text box.", "30px sans", "orange"),
  // ], "transparent", "transparent", 0);
}

let last_render = 0;
let render_loop = (ctx, canvas) => {
  let now = time_now();
  mspf = now - last_render;
  last_render = now;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  /* render objects */
  for_all_objs_l(ui_objs, (o, depth, {ctx, cw, ch}) => {
    o.render(ctx, cw, ch);
    if(render_bboxes)
      render_bbox(o, ctx, bbox_colors[depth % bbox_colors.length]);
  }, {ctx: ctx, cw: canvas.width, ch: canvas.height});

  /* border */
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.stroke();
}

let last_logic = 0;
let logic_loop = (ctx, canvas) => {
  let now = time_now();
  mspu = now - last_logic;
  last_logic = now;

  /* handle object logic */
  for_all_objs(ui_objs, (o, depth, {ctx, cw, ch}) => {
    o.logic(ctx, cw, ch);
  }, {ctx: ctx, cw: canvas.width, ch: canvas.height});

  /* TODO: replace with hooks for objects */
  timers_tb.x = canvas.width - timers_tb.w;
}

window.addEventListener("DOMContentLoaded", async () => {
  const canvas = document.getElementById("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  cw = canvas.width;
  ch = canvas.height;

  canvas.addEventListener("mousemove", mouse_move);
  canvas.addEventListener("mousedown", mouse_down);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  render_begin(ctx, canvas);
  let render_interval = setInterval(render_loop, 1000/60, ctx, canvas);
  let logic_interval = setInterval(logic_loop, 0, ctx, canvas);
});
