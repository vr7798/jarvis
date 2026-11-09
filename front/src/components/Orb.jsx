import './orb.css';

/** CSS 3D: no WebGL context, render loop or heavy dependency on mobile. */
export default function Orb({ active = false, small = false }) {
  return <div className={`ai-orb ${active ? 'is-active' : ''} ${small ? 'is-small' : ''}`} aria-hidden="true">
    <div className="orb-halo" /><div className="orb-scene"><div className="orb-sphere" />
      <div className="orb-orbit orbit-one"><i /></div><div className="orb-orbit orbit-two"><i /></div><div className="orb-orbit orbit-three"><i /></div>
      <span className="orb-star star-one" /><span className="orb-star star-two" /><span className="orb-star star-three" />
    </div><div className="orb-shadow" />
  </div>;
}
