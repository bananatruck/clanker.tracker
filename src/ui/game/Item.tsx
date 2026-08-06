/**
 * One item in a slot.
 *
 * Unlike `Actor`, an item icon is a whole image rather than a frame inside a
 * sheet, so there is nothing to slice and nothing to animate — it loads or it
 * does not. When it does not, the slot still draws: an empty sunken cell with
 * the item's initial in it, which keeps a grid a grid instead of collapsing it
 * into a ragged list on a machine with no art installed.
 */
import { useEffect, useState } from 'react';
import { assetUrl, loadSheet } from '@/lib/game/assets';

export default function Item({
  file,
  name,
  size = 40,
  dim = false,
}: {
  /** Path under `public/`, from lib/game/items.ts. */
  file: string;
  /** What it is. Used as the label and as the fallback glyph. */
  name: string;
  size?: number;
  /** Not earned yet: shown, but plainly not held. */
  dim?: boolean;
}) {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    void loadSheet(file).then((s) => live && setOk(s !== null));
    return () => {
      live = false;
    };
  }, [file]);

  return (
    <span
      className="dq-slot inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, opacity: dim ? 0.35 : 1 }}
      title={name}
    >
      {ok ? (
        <img
          src={assetUrl(file)}
          alt=""
          aria-hidden
          style={{
            maxWidth: size - 8,
            maxHeight: size - 8,
            imageRendering: 'pixelated',
            filter: dim ? 'grayscale(1)' : undefined,
          }}
        />
      ) : (
        // Reserved while probing, and permanent with no art. Either way the
        // cell is the same size, so the grid never reflows under the reader.
        <span className="font-mono text-[13px] text-faint">{ok === null ? '' : name.slice(0, 1)}</span>
      )}
    </span>
  );
}
