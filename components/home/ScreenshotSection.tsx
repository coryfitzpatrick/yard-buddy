import Image from "next/image";

interface Screenshot {
  src: string;
  alt: string;
  width: number;
  height: number;
  title: string;
  caption: string;
}

const HERO: Screenshot = {
  src: "/screenshots/dashboard.png",
  alt: "Yard Analyzer dashboard showing weather, yards, and scheduled tasks",
  width: 1600,
  height: 1971,
  title: "Your whole lawn, one screen",
  caption:
    "Local weather, every yard, and the next thing to do — all on the page the moment you sign in.",
};

const GRID: Screenshot[] = [
  {
    src: "/screenshots/section.png",
    alt: "Front yard section showing a health score of 88 and a chart over time",
    width: 1600,
    height: 1031,
    title: "Watch your lawn actually improve",
    caption:
      "Score your lawn from a single photo. Watch the chart climb as treatments take hold — 32 to 88 in three months.",
  },
  {
    src: "/screenshots/calendar.png",
    alt: "Calendar view of scheduled lawn-care tasks across June",
    width: 1600,
    height: 1031,
    title: "A schedule that fits your weather",
    caption:
      "Fertilizer, fungicide, mowing, overseeding — all stacked in a calendar that respects your climate and grass type.",
  },
  {
    src: "/screenshots/yard-detail.png",
    alt: "Yard detail page with four sections, each with its own health score and grass type",
    width: 1600,
    height: 1031,
    title: "Section by section, not one-size-fits-all",
    caption:
      "Front, back, side, border — different grass, different soil, different plan. We track each one separately.",
  },
  {
    src: "/screenshots/my-yards.png",
    alt: "My Yards page showing two properties with their sections and watering schedules",
    width: 1600,
    height: 1031,
    title: "Multiple properties? Handled.",
    caption:
      "Manage your home, your rental, your parents' place — each with its own spreader, schedule, and section list.",
  },
];

const BADGE = (
  <span className="absolute top-3 right-3 bg-black/60 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm">
    Example data
  </span>
);

export function ScreenshotSection() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-10">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">See it in action</h2>
        <p className="text-base text-gray-500 max-w-xl mx-auto">
          A real demo account with two properties, four months of history, and the kind of
          recommendations you&apos;ll get on day one.
        </p>
      </div>

      <figure className="space-y-4">
        <figcaption className="text-center">
          <h3 className="text-xl font-semibold text-gray-900">{HERO.title}</h3>
          <p className="text-sm text-gray-500 max-w-xl mx-auto mt-1">{HERO.caption}</p>
        </figcaption>
        <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-md bg-white">
          <Image
            src={HERO.src}
            alt={HERO.alt}
            width={HERO.width}
            height={HERO.height}
            className="w-full h-auto"
            priority
          />
          {BADGE}
        </div>
      </figure>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-10 mt-12">
        {GRID.map((shot) => (
          <figure key={shot.src} className="space-y-3">
            <figcaption>
              <h3 className="text-lg font-semibold text-gray-900">{shot.title}</h3>
              <p className="text-sm text-gray-500 mt-1">{shot.caption}</p>
            </figcaption>
            <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white">
              <Image
                src={shot.src}
                alt={shot.alt}
                width={shot.width}
                height={shot.height}
                className="w-full h-auto"
              />
              {BADGE}
            </div>
          </figure>
        ))}
      </div>
    </section>
  );
}
