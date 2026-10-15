// The transparent dragon belongs to the continuous public-page scene.
// DragonLanding.css places it: absolute on the left at desktop widths with its
// head stopping short of the hero copy, in flow as a full-bleed band below the
// hero copy on tablets and phones.
import { useState } from 'react';

import { dragonScene } from './landing/v6/sceneAssets';

import './DragonLanding.css';

export function DragonLanding(): JSX.Element {
  const [failed, setFailed] = useState(false);
  return (
    <figure className={`dragon-landing${failed ? ' dragon-landing--unavailable' : ''}`} data-testid="dragon-landing">
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
          sizes="(max-width: 767px) 128vw, (max-width: 1023px) 100vw, (max-width: 1940px) 56vw, 1086px"
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
