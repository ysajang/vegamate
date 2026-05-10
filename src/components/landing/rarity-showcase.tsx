import { RARITY_ORDER, RARITY_LABELS, RARITY_COLORS } from '@/config/constants';

const RARITY_RATES: Record<string, string> = {
  normal: '60%',
  rare: '30%',
  epic: '8%',
  legendary: '2%',
};

export function RarityShowcase() {
  return (
    <div className="grid w-full max-w-md grid-cols-4 gap-2">
      {RARITY_ORDER.map((rarity) => (
        <div
          key={rarity}
          className="flex flex-col items-center gap-2 rounded-xl border border-border/30 bg-card/30 p-3 backdrop-blur-sm"
        >
          <div
            className="h-3 w-3 rounded-full"
            style={{
              backgroundColor: RARITY_COLORS[rarity],
              boxShadow: `0 0 12px ${RARITY_COLORS[rarity]}60`,
            }}
          />
          <span className="text-xs font-medium" style={{ color: RARITY_COLORS[rarity] }}>
            {RARITY_LABELS[rarity]}
          </span>
          <span className="text-xs text-muted-foreground">{RARITY_RATES[rarity]}</span>
        </div>
      ))}
    </div>
  );
}
