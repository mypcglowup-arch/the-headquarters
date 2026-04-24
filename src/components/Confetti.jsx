import { useEffect, useState } from 'react';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4'];

function rand(min, max) { return Math.random() * (max - min) + min; }

export default function Confetti({ active }) {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (!active) return;
    const p = Array.from({ length: 18 }, (_, i) => ({
      id: i,
      color: COLORS[i % COLORS.length],
      tx: rand(-70, 70),
      ty: rand(-90, -20),
      r: rand(-180, 180),
      size: rand(5, 9),
    }));
    setParticles(p);
    const t = setTimeout(() => setParticles([]), 700);
    return () => clearTimeout(t);
  }, [active]);

  if (!particles.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible" style={{ zIndex: 50 }}>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-sm confetti-particle"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            '--tx': `${p.tx}px`,
            '--ty': `${p.ty}px`,
            '--r':  `${p.r}deg`,
          }}
        />
      ))}
    </div>
  );
}
