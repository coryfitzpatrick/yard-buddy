import Image from "next/image";

interface Screenshot {
  src: string;
  alt: string;
  width: number;
  height: number;
}

const SCREENSHOTS: Screenshot[] = [
  // Add screenshot files to /public/screenshots/ and list them here
  // { src: "/screenshots/dashboard.png", alt: "Dashboard view", width: 1280, height: 800 },
];

export function ScreenshotSection() {
  if (SCREENSHOTS.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <div className="text-center mb-4">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">See it in action</h2>
        <p className="text-base text-gray-500 max-w-xl mx-auto">
          These screenshots show a sample yard. Your results will reflect your actual lawn,
          grass type, and local conditions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
        {SCREENSHOTS.map((shot) => (
          <div key={shot.src} className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            <Image
              src={shot.src}
              alt={shot.alt}
              width={shot.width}
              height={shot.height}
              className="w-full h-auto"
            />
            <span className="absolute top-3 right-3 bg-black/60 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm">
              Example data
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
