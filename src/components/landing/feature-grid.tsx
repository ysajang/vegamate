const FEATURES = [
  {
    emoji: '🎲',
    title: 'Daily Free Draw',
    desc: 'One free gacha pull every day',
  },
  {
    emoji: '🎨',
    title: 'AI-Generated Art',
    desc: 'Unique anime-style wallpapers',
  },
  {
    emoji: '📱',
    title: 'Phone-Ready',
    desc: 'Perfect fit for your screen',
  },
  {
    emoji: '🏆',
    title: 'Rare Collectibles',
    desc: 'Chase Legendary drops at 2%',
  },
] as const;

export function FeatureGrid() {
  return (
    <div className="grid w-full max-w-md grid-cols-2 gap-3">
      {FEATURES.map((f) => (
        <div
          key={f.title}
          className="flex flex-col gap-1.5 rounded-xl border border-border/30 bg-card/30 p-4 backdrop-blur-sm"
        >
          <span className="text-2xl">{f.emoji}</span>
          <h3 className="text-sm font-semibold">{f.title}</h3>
          <p className="text-xs text-muted-foreground">{f.desc}</p>
        </div>
      ))}
    </div>
  );
}
