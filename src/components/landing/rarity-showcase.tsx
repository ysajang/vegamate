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
    <div className="w-full max-w-md">
      <h3 className="mb-3 text-center text-sm font-semibold text-muted-foreground">
        Gacha Drop Rates
      </h3>
      <div className="flex flex-col gap-2">
        {RARITY_ORDER.map((rarity) => (
          <div
            key={rarity}
            className="flex items-center gap-3 rounded-lg border border-border/30 bg-card/30 px-4 py-2.5 backdrop-blur-sm"
          >
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: RARITY_COLORS[rarity],
                boxShadow: `0 0 10px ${RARITY_COLORS[rarity]}50`,
              }}
            />
            <span
              className="w-24 text-xs font-semibold"
              style={{ color: RARITY_COLORS[rarity] }}
            >
              {RARITY_LABELS[rarity]}
            </span>
            <span className="flex-1 text-xs text-muted-foreground/70">
              {RARITY_CONTENT[rarity]}
            </span>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {RARITY_RATES[rarity]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
