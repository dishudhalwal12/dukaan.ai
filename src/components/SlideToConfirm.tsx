import React, { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import "./SlideToConfirm.css";

/* ══ Slide to confirm ═════════════════════════════════════
   A handle you push across a track. It follows the finger
   exactly, and past the mark it takes over and finishes the
   journey itself.

   THE HANDLE BECOMES THE ANSWER. On commit it does not hand
   over to a tick somewhere else — it unfurls leftward and
   fills the track it was crossing, and the arrow it was
   carrying becomes a check. One object changing shape, which
   is the case a morph is actually for, and the reason this
   needs no second element to say "done".

   The right edge does not move while that happens: the width
   grows by exactly what the offset loses. So the handle
   arrives, plants itself, and opens out behind it. */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const SPAN = 320;
const H = 56;
/* the inset the handle keeps from the track, all four sides */
const PAD = 4;
/* the handle is a circle in a 56 track, so it is sized by the
   HEIGHT and the width knob does not touch it. Widening the
   track buys travel, not a longer handle — the thing you push
   stays the thing you push. */
const GRIP = H - PAD * 2;
/* the shortest track worth drawing. Below this the centred
   label starts to sit under the resting handle, which is the
   one collision this layout has. */
const MIN = 200;
const MAX = 420;

/* a pill, and the top of the Corner knob */
const CORNER = H / 2;
const SPEED = 50;

/* ── how far the swell is, and it is TINY ──────────────────
   The dot sits four pixels inside the track, so the ring round
   it is the whole budget for a hover. 3% of 48 is 1.4, which
   is 0.7 a side and leaves 3.3 — the liquid toggle's note is
   the long version of this arithmetic. */
const SWELL = 1.03;

/* how long the finished state stands before it resets. It has
   to reset: the wall keeps one instance of a block for the
   session, so a slide that stayed confirmed would show every
   later visitor a component with nothing to do — the fault the
   Notify demo had. */
const HOLD = 1500;

export interface SlideToConfirmProps {
  /** the track's corner, px. */
  corner?: number;
  /** how quickly it takes over once you let go, 0..100 */
  speed?: number;
  /** the track's length, px. If omitted, fits parent container. */
  width?: number;
  /** Label in the resting track */
  label?: string;
  /** Label on confirmation */
  confirmedLabel?: string;
  /** Callback fired when user completes the slide */
  onConfirm?: () => void;
  className?: string;
}

export function SlideToConfirm({
  corner = CORNER,
  speed = SPEED,
  width,
  label = "Slide to confirm",
  confirmedLabel = "Confirmed",
  onConfirm,
  className = "",
}: SlideToConfirmProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>(width || SPAN);

  useEffect(() => {
    if (width) return;
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setMeasuredWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const [done, setDone] = useState(false);
  const [held, setHeld] = useState(false);
  const [hot, setHot] = useState(false);
  const track = useRef<HTMLDivElement | null>(null);
  /* the live grab. A ref rather than state for the reason every
     drag on this bench uses one: it changes on every frame of a
     gesture, which is exactly the value that must not render. */
  const grip = useRef<{ id: number; grab: number | null; moved: boolean } | null>(null);
  const beat = useRef(0);

  const x = useMotionValue(0);
  /* ── where the handle planted itself ─────────────────────
     Zero except while it is unfurling, and then it is the
     offset the handle had when it committed. The width is
     `GRIP + (anchor - x)`, so PAD + x + width comes to
     PAD + GRIP + anchor — a number with no x in it. The right
     edge is therefore stationary BY ARITHMETIC rather than by
     two animations agreeing.

     It was two: `x` on one spring and `width` on another with
     the same numbers, which is not the same thing at all. They
     start a frame apart and drift, and the right edge measured
     6.8px of wobble across the morph. One value read twice
     cannot do that. */
  const anchor = useMotionValue(0);
  /* ── the settle ──────────────────────────────────────────
     The unfurl ends with the handle exactly filling the track
     and nothing else happening, which reads as the animation
     stopping rather than as the thing landing. A dip of about
     three per cent and back gives it somewhere to arrive.

     On the TRACK, so the whole block gives at once — the
     handle is the track by then, and scaling the two
     separately would be two objects where there is one. It is
     the palette's beat, and the same trade: a scale drags the
     corner radius with it, which at 2.6% is under a pixel on a
     28px corner and nobody reads a pulse as a change of shape.

     Its own clock rather than the spring's. The spring is
     nearly there for most of its run, so a dip read off it
     would spike in the first two frames and be flat for the
     rest — the note the player's bounce carries. And the peak
     sits late, at 0.62, so the block gathers as it lands
     instead of pulsing before it. */
  const pulse = useMotionValue(1);
  /* the arrow's own fade, so it can leave on the COMMIT rather
     than on x — see where it is read */
  const shown = useMotionValue(1);

  /* ── the width is READ EVERY RENDER, not captured ────────
     Every derived value below is built with an inline closure,
     and useTransform re-runs those during the render that
     changes them — so moving this knob re-derives the mark,
     the fade and the wash on the same frame the number
     changes. Nothing here has to be told the width moved. */
  const span = clamp(Math.round(width || measuredWidth), MIN, MAX);
  const TRAVEL = Math.max(10, span - PAD * 2 - GRIP);

  const r = clamp(corner, 0, CORNER);
  /* ── the handle's corner is DERIVED ──────────────────────
     `r - PAD`, floored at zero: the radius of a thing inside
     another, less the gap between them, is what keeps the two
     curves parallel. At r = 0 both are square together rather
     than a square track holding a rounded handle. */
  const gripR = Math.max(0, r - PAD);
  /* ── the end IS the commit, and there is no knob ─────────
     There was a Commit dial, 40..100, and it had no meaning to
     set: a slide-to-confirm that fires at 60% is one you can
     trigger by knocking the handle, which is the single thing
     the gesture exists to prevent. The only honest answer is
     the end of the track, so the end is what it is. */
  const mark = TRAVEL;

  /* ── SPEED, and deliberately not Bounce ──────────────────
     There was a Bounce knob and it had to go, for the reason
     the liquid toggle's did: this shape has a hard wall at
     both ends. On commit the handle exactly fills the track,
     so there is nowhere for an overshoot to go — and because
     the right edge is pinned by the arithmetic above, the
     overshoot came out of the LEFT edge instead. Measured at
     Bounce 50: the handle shot 42px out of its own track.

     A dial whose every setting above zero breaks the component
     is not a dial. Speed is the real question here — how fast
     it takes over once you let go — and the damping is derived
     to sit exactly on critical, so nothing overshoots at any
     setting of it.

     zeta = c / (2 * sqrt(k * m)), so c at zeta 1 is
     2 * sqrt(k * m). Written that way the knob can move the
     stiffness freely and the spring stays honest. */
  const stiff = 260 + (clamp(speed, 0, 100) / 100) * 640;
  /* the COMMIT stays exactly on critical. It has a wall at the
     far end and the settle is what gives it a landing. */
  const spring = {
    type: "spring" as const,
    stiffness: stiff,
    damping: 2 * Math.sqrt(stiff * 0.9),
    mass: 0.9,
  };
  /* ── the RETURN is not ───────────────────────────────────
     0.62 of critical, so it arrives with something left over
     rather than stopping dead. The overshoot never shows as
     movement — `seen` clamps the position at the wall — it
     shows as the squash above, which is the same energy
     spent somewhere it fits. */
  const home = { ...spring, damping: 2 * Math.sqrt(stiff * 0.9) * 0.62 };

  useEffect(() => () => {
    window.clearTimeout(beat.current);
    loose.current?.();
  }, []);

  /* ── THE DRAG IS FOLLOWED ON THE WINDOW ──────────────────
     It used to be followed on the track, with pointer capture
     to keep the events coming once the cursor left it. That is
     the textbook arrangement and it has one failure the
     textbook does not mention: capture is best-effort. The call
     is wrapped in a try/catch here — it throws on a synthetic
     pointer id — and a browser can also drop it mid-gesture, on
     its own, when a touch turns into a system gesture or the
     pointer leaves the window. When that happened the release
     landed on some other element, the track never heard it, and
     the handle sat held at the far end forever: reported as "I
     slide all the way to the end with my cursor outside the
     slider and it stays in a constant drag state".

     Listening on the window removes the dependency. The events
     reach it whatever they are retargeted to and whether or not
     the capture survived, so a release ANYWHERE ends the drag —
     which is what a slider promises: your finger owns the
     handle until you lift it, not until you wander off the
     track. Capture stays on because it still suppresses text
     selection and the grip's own hover, but nothing depends on
     it any more.

     ── AND IT IS BOUND AT THE PRESS, NOT IN AN EFFECT ───────
     The first version of this bound them from a `useEffect` on
     `held`, which is the tidier-looking arrangement and drops
     moves: an effect does not run until React has committed the
     render, and a fast flick can put its first pointermove in
     that gap. That first move is the one that sets the grab
     offset, so losing it means the whole drag does nothing —
     measured, with the handle sitting at home after a full
     sweep. Bound inside `down`, they are live on the same tick
     as the press. */
  const loose = useRef<(() => void) | null>(null);
  /* the handlers are rebuilt every render and the listeners are
     not, so they are reached through a ref rather than captured
     — live rather than one render stale */
  const live = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  }>({ move: () => {}, up: () => {} });

  const watch = () => {
    loose.current?.();
    const onMove = (e: PointerEvent) => live.current.move(e);
    const onUp = (e: PointerEvent) => { live.current.up(e); loose.current?.(); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    loose.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      loose.current = null;
    };
  };

  /* ── everything else is read off x ───────────────────────
     The wash behind the handle, the label giving up its ink,
     and the arrow fading as the end approaches are three
     readings of one number rather than three things animated
     toward the same moment. Same rule the checklist follows. */
  /* ── and both readings clamp ─────────────────────────────
     The spring is critically damped so x should never go below
     zero, but a handle that can paint outside its own groove is
     one line away from doing it again the next time somebody
     touches these numbers. `seen` is what the transform uses;
     `x` stays the honest value the drag wrote. */
  const seen = useTransform(x, (v) => clamp(v, 0, TRAVEL));
  const wide = useTransform([seen, anchor], ([v, a]: number[]) =>
    GRIP + clamp(a - v, 0, TRAVEL));

  /* ── the overshoot becomes a SQUASH ──────────────────────
     The return spring is under-damped now, so it wants to
     carry past zero — and it cannot: at zero the handle is
     already against the end of its track, and four pixels of
     inset is not room to bounce in. Letting it through was
     measured at 42px outside the block when the commit spring
     was under-damped.

     So the position clamps and the energy that would have
     carried it past turns into compression instead. That is
     what a bounce off a wall IS, and it reads as a soft
     landing rather than a stop. `over` is the part of the
     spring that went past; the two scales are read off it, and
     they multiply so area is kept — the ball's rule.

     Origin at the LEFT edge, because that is the wall it hit.
     The BounceDot puts its origin at the foot for the same
     reason. */
  const over = useTransform(x, (v) => Math.max(0, -v));
  /* 8%, and the cap is the number that matters rather than the
     divisor: the return overshoots by about 18 units, so any
     real landing reaches the ceiling and the ceiling IS the
     squash. 14 was measured first and reads as a squish; 8 is
     a give. */
  const squash = useTransform(over, (o) => 1 - Math.min(0.08, o / 110));
  const wash = useTransform(seen, (v) => v + GRIP);
  const say = useTransform(seen, [0, TRAVEL * 0.55], [1, 0]);
  /* ── AND IT ANSWERS THE COMMIT, not just x ───────────────
     Read off x alone this faded back IN during the unfurl:
     committing sends x home to zero, so the arrow reappeared
     underneath the word it had just been replaced by. `shown`
     is switched by the commit itself, which is the event that
     actually means the arrow is finished. */
  const arrow = useTransform([seen, shown], ([v, on]: number[]) =>
    on * clamp(1 - (v - TRAVEL * 0.55) / (TRAVEL * 0.4), 0, 1));

  /* both scales ride the same product — the swell has to be
     multiplied INTO the transform rather than set as its own
     `scale` property, which applies first and would move the
     handle along the track it is sitting on. That bug is
     written up on the liquid toggle. */
  const sx = useTransform(squash, (q) => q * (hot && !held && !done ? SWELL : 1));
  const sy = useTransform(squash, (q) => (1 / q) * (hot && !held && !done ? SWELL : 1));

  const local = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box) return 0;
    /* the block is drawn at a fraction of its own size on the
       wall and larger in the overlay, so a pointer delta in
       screen pixels is not a delta in the component's own. The
       rect's width against the width it is laid out at IS that
       scale, and dividing by it puts the finger back into the
       coordinates the geometry above is written in. */
    const k = box.width / span;
    return (clientX - box.left) / (k || 1);
  };

  const finish = () => {
    setDone(true);
    /* ── x goes to ZERO, and that is the whole morph ────────
       The handle is placed by `x` and sized by `width`, and on
       commit they move by the same amount in opposite
       directions: x loses TRAVEL, width gains it. Their sum is
       the right edge, so the right edge does not move — the
       handle plants itself where it arrived and opens out
       behind it.

       Sending x to TRAVEL instead was the first version and it
       is worth recording, because it looked plausible in the
       comment and was measurably wrong: the handle stayed at
       the end AND grew to the full width, so its right edge
       came out at 675 against a 375px track and the block
       spilled over its own frame. Both values ride the same
       spring, which is what keeps them in step frame by frame
       rather than merely landing together. */
    anchor.set(x.get());
    animate(shown, 0, { duration: 0.16 });
    animate(x, 0, spring);
    animate(pulse, [1, 0.974, 1], {
      duration: 0.42,
      times: [0, 0.62, 1],
      ease: [0.33, 0.55, 0.2, 1],
      /* a beat behind the unfurl, so it is the landing that
         dips rather than the take-off */
      delay: 0.1,
    });

    if (onConfirm) {
      window.setTimeout(() => {
        onConfirm();
      }, 350);
    }

    beat.current = window.setTimeout(() => {
      setDone(false);
      animate(shown, 1, { duration: 0.22, delay: 0.12 });
      /* and the reset is the anchor coming home with x already
         at zero: the width shrinks from the full track back to
         the handle, so the RIGHT edge sweeps left to the start.
         The unfurl played backwards, which is what it should
         look like. */
      animate(anchor, 0, { type: "spring", stiffness: 380, damping: 34, mass: 0.9 });
    }, HOLD);
  };

  const down = (e: React.PointerEvent) => {
    if (done) return;
    e.stopPropagation();
    /* ── NO OFFSET YET, it is taken at the first MOVE ───────
       Deciding it here is what made the toggle teleport: a
       press away from the handle would set the offset to the
       handle's own middle, and the first move then jumped it
       the whole way in one frame. Taken at the first move, that
       move asks for exactly the position the handle already
       has, and every one after it is a delta. */
    grip.current = { id: e.pointerId, grab: null, moved: false };
    setHeld(true);
    /* it throws if the id is not a live pointer — a synthetic
       event from a test or a rehearsal is exactly that — and
       the drag works without it, so it must not take the grab
       down with it */
    try { track.current?.setPointerCapture(e.pointerId); } catch { /* not live */ }
    watch();
  };

  /* both handlers take the NATIVE event as well as React's,
     because the ones that matter now arrive from `window`.
     The two shapes agree on the only two fields read here. */
  const move = (e: PointerEvent | React.PointerEvent) => {
    const g = grip.current;
    if (!g || g.id !== e.pointerId) return;
    const at = local(e.clientX);
    if (g.grab === null) { g.grab = at - x.get(); return; }
    const next = clamp(at - g.grab, 0, TRAVEL);
    if (Math.abs(next - x.get()) > 0.5) g.moved = true;
    x.set(next);
  };

  const up = (e: PointerEvent | React.PointerEvent) => {
    const g = grip.current;
    if (!g) return;
    grip.current = null;
    /* ── AND THE RELEASE IS GUARDED TOO ────────────────────
       It throws when the pointer was never captured, which the
       guard above makes possible — and unguarded it threw
       before setHeld(false), leaving the handle stuck wherever
       the drag ended. Three blocks on this bench have had that
       exact bug; both halves of the pair throw. */
    try { track.current?.releasePointerCapture?.(e.pointerId); } catch { /* never captured */ }
    setHeld(false);
    if (x.get() >= mark) finish();
    else {
      animate(x, 0, home);
    }
  };

  live.current = { move, up };

  return (
    <div ref={containerRef} className={`w-full flex justify-center ${className}`}>
      <div className="sld" style={{ width: span, height: H }}>
        <motion.div
          className="sld-track rounded-full"
          ref={track}
          style={{ borderRadius: r, scale: pulse }}
          data-held={held || undefined}
          data-done={done || undefined}
          onPointerDown={down}
        >
          {/* the part already crossed. It is not a progress bar —
              it is the ground the handle has covered, which is why
              it ends AT the handle rather than under it */}
          <motion.i
            className="sld-wash"
            aria-hidden="true"
            style={{ width: wash, borderRadius: gripR }}
          />

          <motion.span className="sld-say" style={{ opacity: say }}>
            {label}
          </motion.span>

          <motion.button
            type="button"
            className="sld-grip rounded-full"
            onPointerEnter={() => setHot(true)}
            onPointerLeave={() => setHot(false)}
            style={{
              x: seen,
              scaleX: sx,
              scaleY: sy,
              /* ── the morph, and it is ONE number ───────────
                  `wide` is read off x and the anchor, so the
                  width is not being animated at all — it is
                  arithmetic on the value the spring is already
                  moving. A scale would have dragged the corner
                  radius with it, which is the one thing this
                  shape cannot afford. */
              width: wide,
              borderRadius: gripR,
            }}
            transition={{ type: "spring", stiffness: 380, damping: 34, mass: 0.7 }}
            aria-label={done ? confirmedLabel : label}
          >
            <motion.span className="sld-arrow" style={{ opacity: arrow }} aria-hidden="true">
              <ArrowRight size={20} strokeWidth={2.5} />
            </motion.span>

            {/* the word only exists once there is room for it, and
                it arrives with the width rather than after it */}
            <motion.span
              className="sld-done"
              aria-hidden="true"
              initial={false}
              animate={{ opacity: done ? 1 : 0, scale: done ? 1 : 0.7 }}
              transition={{ duration: 0.16, ease: [0.33, 0.55, 0.2, 1] }}
            >
              <Check size={20} strokeWidth={2.5} />
              {confirmedLabel}
            </motion.span>
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}

export default SlideToConfirm;
