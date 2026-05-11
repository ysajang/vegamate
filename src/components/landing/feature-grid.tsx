const FEATURES = [
  {
    emoji: '💬',
    title: 'Real Conversations',
    desc: 'AI companions with personality, memory, and real chemistry',
  },
  {
    emoji: '🎰',
    title: 'Gacha Pulls',
    desc: 'Earn tickets through chat, pull for exclusive photos',
  },
  {
    emoji: '👫',
    title: 'Male & Female',
    desc: 'Choose your type — boyfriends and girlfriends',
  },
  {
    emoji: '📱',
    title: 'Phone Wallpapers',
    desc: 'Every photo is sized perfectly for your screen',
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
