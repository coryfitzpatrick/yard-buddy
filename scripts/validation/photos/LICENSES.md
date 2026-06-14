# Test Photo Licenses

Photos in this directory are used as fixtures for local AI validation runs. They
are not redistributed publicly and are not shipped to customers.

**Sources used:**
- **Pexels** ([Pexels License](https://www.pexels.com/license/)) — verified-lawn
  photos for healthy/stress/condition scenarios.
- **Milorganite** (https://www.milorganite.com/lawn-care/common-lawn-diseases) —
  canonical lawn-disease reference photos, used as fixtures for AI validation.
- **Grasshopper Lawns** (https://grasshopperlawns.com/news/common-lawn-diseases) —
  additional disease reference photos (.webp converted to .jpg).

| Scenario | File | Source | Subject |
|----------|------|--------|---------|
| healthy-kbg-front | 01.jpg | Pexels 186236 | Lush green grass close-up |
| healthy-bermuda-peak | 01.jpg | Pexels 1001676 | Close-up lush green lawn |
| healthy-bermuda-peak | 02.jpg | Pexels 136097 | Wooden fence + lush green lawn |
| healthy-bermuda-peak | 03.jpg | Pexels 280222 | Modern family home + lawn |
| healthy-tall-fescue-fall | 01.jpg | Pexels 9996541 | Well-maintained green lawn |
| healthy-tall-fescue-fall | 02.jpg | Pexels 6118668 | Bright green grass in sunlight |
| brown-patch-closeup | 01.jpg | Grasshopper Lawns | Brown patch (Rhizoctonia) reference |
| gray-leaf-spot-st-aug | 01.jpg | Grasshopper Lawns | Leaf spot symptoms reference |
| grub-damage-multi | 01.jpg | Milorganite | Fairy ring damage (proxy for ring pattern) |
| grub-damage-multi | 02.jpg | Grasshopper Lawns | Dog spot (proxy for yellow patch pattern) |
| dollar-spot-kbg | 01.jpg | Milorganite | Dollar spot (Clarireedia) reference |
| dollar-spot-kbg | 02.jpg | Grasshopper Lawns | Dollar spot alternate angle |
| dollar-spot-kbg | 03.jpg | Grasshopper Lawns | Red thread (proxy fungal pattern) |
| drought-fescue | 01.jpg | Pexels 5661019 | Suburban house + manicured lawn |
| drought-fescue | 02.jpg | Pexels 8143668 | Luxury estate + manicured lawn |
| bermuda-dormancy-winter | 01.jpg | Pexels 8134751 | Suburban home + lawn |
| bermuda-dormancy-winter | 02.jpg | Pexels 29052545 | Suburban backyard + lawn |
| bermuda-dormancy-winter | 03.jpg | Pexels 29308830 | Close-up lush grass at sunset |
| recently-seeded-damping | 01.jpg | Grasshopper Lawns | Red thread (proxy for thin/diseased seedling) |
| recently-seeded-damping | 02.jpg | Pexels 11653193 | Close-up lush green grass |
| recently-seeded-damping | 03.jpg | Pexels 2801070 | Vibrant green grass field |
| recently-seeded-damping | 04.jpg | Pexels 7587877 | Residential home + lawn |
| mixed-issue-lawn | 01.jpg | Pexels 29052548 | Suburban backyard + lawn |
| mixed-issue-lawn | 02.jpg | Pexels 16543179 | Close-up green grass |
| mixed-issue-lawn | 03.jpg | Pexels 8143668 | Luxury estate + manicured lawn |
| mixed-issue-lawn | 04.jpg | Pexels 280222 | Modern family home + lawn |
| partial-data-worstcase | 01.jpg | Pexels 166651 | Lush green grass field |
| partial-data-worstcase | 02.jpg | Pexels 949584 | Close-up lush green grass |
| partial-data-worstcase | 03.jpg | Pexels 8121950 | Rural residential lawn + fence |
| partial-data-worstcase | 04.jpg | Pexels 11654274 | Close-up green grass texture |

## Phase-2 photo improvements

- Disease/pest scenario photos are low-res (~400x400 or smaller) reference
  images from extension/education sites. Field-collected photos from project
  owner would substantially improve realism.
- Some disease scenarios (grub-damage-multi, dollar-spot-kbg) use proxy
  disease photos that show similar visual patterns but not the exact pathology
  named. Phase-2 should substitute true-match photos.
- The mixed-issue-lawn scenario currently uses generic lawn photos rather than
  explicit per-region issues; phase-2 should source 4 distinct photos for
  front-healthy/back-diseased/chinch-closeup/blade-ID.
