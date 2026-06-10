const DIFFERENTIATORS = [
  {
    heading: "Your whole yard, section by section",
    body: "Front yard gets morning sun and struggles with weeds. Back yard is shaded with different grass. Most apps treat your yard as one blob. Yard Analyzer tracks each section separately — different grass types, different schedules, different soil.",
  },
  {
    heading: "No kit to buy. Any soil test works.",
    body: "Some apps lock you out of custom plans unless you buy their $30 kit. Yard Analyzer works with results from any lab, any test strip, or any kit you already have. Enter your N-P-K numbers and get precise fertilizer recommendations immediately.",
  },
  {
    heading: "Unbiased advice across all brands",
    body: "Other apps push their own product line. Our AI recommends what's right for your lawn — Scotts, Jonathan Green, Milorganite, generic store brand, or organic options — with price ranges so you can choose what fits your budget.",
  },
  {
    heading: "Watch your lawn actually improve",
    body: "A photo history timeline shows how your lawn looks month by month. See the before and after. Track which treatments are working. No other app shows you your lawn's health history like this.",
  },
];

export function WhyYardAnalyzer() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">Why Yard Analyzer?</h2>
        <p className="text-lg text-gray-500 max-w-xl mx-auto">
          Personalized advice that actually matches your yard — not a generic plan pushed by a brand.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {DIFFERENTIATORS.map((item) => (
          <div
            key={item.heading}
            className="bg-white rounded-xl border border-gray-200 p-6 space-y-2"
          >
            <h3 className="text-lg font-semibold text-gray-900">{item.heading}</h3>
            <p className="text-gray-500 leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
