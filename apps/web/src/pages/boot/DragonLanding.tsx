// The transparent dragon belongs to the continuous public-page scene.
// DragonLanding.css places it: absolute on the left at desktop widths, in flow
// and cropped to a landscape band below the hero copy on tablets and phones.
import { useState } from 'react';

import { dragonScene } from './landing/v6/sceneAssets';

import './DragonLanding.css';

export function DragonLanding(): JSX.Element {
  const [failed, setFailed] = useState(false);
  return (
    <figure className={`dragon-landing${failed ? ' dragon-landing--unavailable' : ''}`} data-testid="dragon-landing">
      <svg className="dragon-landing__traces" viewBox="0 0 1086 1448" preserveAspectRatio="xMinYMin slice" fill="none" aria-hidden="true" focusable="false">
        <g className="dragon-landing__rails">
          <path d="M40 228H1046M150 388H1046M20 580H1006M160 748H1046M80 960H1026" />
        </g>
        <g className="dragon-landing__flow-lines">
          <path d="M0 228H100" className="dragon-landing__flow" />
          <path d="M0 388H64" className="dragon-landing__flow" />
          <path d="M0 580H120" className="dragon-landing__flow" />
          <path d="M0 748H80" className="dragon-landing__flow" />
          <path d="M0 960H56" className="dragon-landing__flow" />
        </g>
      </svg>
      {failed ? (
        <div className="dragon-landing__unavailable" role="status">
          <p>The dragon artwork could not load.</p>
          <button type="button" onClick={() => setFailed(false)}>Try again</button>
        </div>
      ) : (
        <img
          className="dragon-landing__poster"
          data-testid="dragon-poster"
          src={dragonScene.src}
          srcSet={dragonScene.srcSet}
          sizes="(max-width: 767px) 136vw, (max-width: 1023px) 70vw, (max-width: 1500px) 52vw, 1086px"
          width={dragonScene.width}
          height={dragonScene.height}
          alt="A graphic Japanese dragon racing right, with flowing cyan ribbons, two pearl horns and one continuous S-shaped body."
          fetchPriority="high"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </figure>
  );
}
