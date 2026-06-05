const FEATURES = [
  {
    emoji: '💬',
    title: 'Real Conversations',
    desc: 'AI companions with personality, memory, and real chemistry',
  },
  {
    emoji: '📸',
    title: 'Surprise Drops',
    desc: 'Keep chatting and they surprise you with exclusive photos',
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
    <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-2">
      {FEATURES.map((f) => (
        <div
          key={f.title}
          className="flex flex-col gap-1 rounded-lg border border-border/30 bg-card/30 p-3 backdrop-blur-sm"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-base">{f.emoji}</span>
            <h3 className="text-xs font-semibold">{f.title}</h3>
          </div>
          <p className="text-[11px] leading-tight text-muted-foreground">{f.desc}</p>
        </div>
      ))}
    </div>
  );
}
