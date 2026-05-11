import { RARITY_ORDER, RARITY_LABELS, RARITY_COLORS, RARITY_CONTENT } from '@/config/constants';

const RARITY_RATES: Record<string, string> = {
  common: '45%',
  uncommon: '30%',
  rare: '15%',
  epic: '8%',
  legendary: '2%',
};

export function RarityShowcase() {
  return (
    <div className="mx-auto w-full max-w-md">
      <h3 className="mb-2 text-center text-xs font-semibold text-muted-foreground">
        Gacha Drop Rates
      </h3>
      <div className="flex flex-col gap-1">
        {RARITY_ORDER.map((rarity) => (
          <div
            key={rarity}
            className="flex items-center gap-2.5 rounded-md border border-border/20 bg-card/20 px-3 py-1.5 backdrop-blur-sm"
          >
            <div
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: RARITY_COLORS[rarity],
                boxShadow: `0 0 8px ${RARITY_COLORS[rarity]}40`,
              }}
            />
            <span
              className="w-20 text-[11px] font-semibold"
              style={{ color: RARITY_COLORS[rarity] }}
            >
              {RARITY_LABELS[rarity]}
            </span>
            <span className="flex-1 text-[11px] text-muted-foreground/60">
              {RARITY_CONTENT[rarity]}
            </span>
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
              {RARITY_RATES[rarity]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
