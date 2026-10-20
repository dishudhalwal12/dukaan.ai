import React, { useEffect, useRef } from 'react';
import type { Driver } from 'driver.js';

interface TourFocusRingProps {
  getDriver: () => Driver | null;
  padding?: number;
}

const STAGE_RADIUS = 14;

/**
 * A separate SVG ring that tracks driver's highlighted element. It is not part
 * of the app DOM, so the highlighted field keeps its normal layout and visuals.
 */
export const TourFocusRing: React.FC<TourFocusRingProps> = ({ getDriver, padding = 5 }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const glowRef = useRef<SVGRectElement>(null);
  const pathRef = useRef<SVGRectElement>(null);
  const getDriverRef = useRef(getDriver);
  getDriverRef.current = getDriver;

  useEffect(() => {
    let frame = 0;
    let visible = false;

    const setRingBox = (x: number, y: number, width: number, height: number) => {
      for (const rect of [glowRef.current, pathRef.current]) {
        if (!rect) continue;
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(width));
        rect.setAttribute('height', String(height));
        rect.setAttribute('rx', String(STAGE_RADIUS));
        rect.setAttribute('ry', String(STAGE_RADIUS));
      }
    };

    const tick = () => {
      const activeElement = getDriverRef.current()?.getActiveElement();
      if (activeElement && svgRef.current) {
        const box = activeElement.getBoundingClientRect();
        setRingBox(
          box.left - padding,
          box.top - padding,
          box.width + padding * 2,
          box.height + padding * 2
        );
        if (!visible) {
          svgRef.current.style.opacity = '1';
          visible = true;
        }
      } else if (visible && svgRef.current) {
        svgRef.current.style.opacity = '0';
        visible = false;
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [padding]);

  return (
    <svg ref={svgRef} className="tour-focus-ring" aria-hidden="true" style={{ opacity: 0 }}>
      <rect ref={glowRef} className="tour-focus-ring-glow" x="0" y="0" width="0" height="0" />
      <rect
        ref={pathRef}
        className="tour-focus-ring-path"
        x="0"
        y="0"
        width="0"
        height="0"
        pathLength={100}
      />
    </svg>
  );
};

export default TourFocusRing;
