# Test Photo Licenses

Photos in this directory are used as fixtures for local AI validation runs. They
are not redistributed publicly and are not shipped to customers.

## Sources

- **Pexels** ([Pexels License](https://www.pexels.com/license/)) — verified-lawn
  photos for healthy / stress / condition scenarios.
- **The Spruce** (https://www.thespruce.com/common-lawn-diseases-2153078) —
  user-supplied screenshots of disease reference photos (cropped to remove
  disease-name labels and credit lines). Used as local fixtures.
- **Lawngevity** (https://lawngevity.org/photos/) — comprehensive
  lawn-problem identification library (weeds, insects, diseases, dormancy,
  drought, chinch bug damage, etc.).
- **Covington Naturals fungus-ID page**
  (https://covingtonnaturals.com/blogs/news/lawn-grass-fungus-identification-pictures) —
  university-credited disease photos (NC State, Kansas State, Iowa State, UMass).
- **Milorganite** disease guide (still referenced in some slots).
- **Grasshopper Lawns** disease guide (.webp converted to .jpg).

## Per-scenario assignments

| Scenario | File | Source | Subject |
|----------|------|--------|---------|
| healthy-kbg-front | 01.jpg | Pexels 186236 | Lush green grass close-up |
| healthy-bermuda-peak | 01.jpg | Pexels 1001676 | Close-up lush green lawn |
| healthy-bermuda-peak | 02.jpg | Pexels 136097 | Wooden fence + lush green lawn |
| healthy-bermuda-peak | 03.jpg | Pexels 280222 | Modern family home + lawn |
| healthy-tall-fescue-fall | 01.jpg | Pexels 9996541 | Well-maintained green lawn |
| healthy-tall-fescue-fall | 02.jpg | Pexels 6118668 | Bright green grass in sunlight |
| brown-patch-closeup | 01.jpg | The Spruce screenshot | Brown Patch (canonical) |
| gray-leaf-spot-st-aug | 01.jpg | NC State (via Covington) | Gray leaf spot (canonical) |
| grub-damage-multi | 01.jpg | The Spruce screenshot | Anthracnose / patch damage |
| grub-damage-multi | 02.jpg | Lawngevity | Billbug larva (real grub photo) |
| dollar-spot-kbg | 01.jpg | The Spruce screenshot | Pink snow mold (round patches) |
| dollar-spot-kbg | 02.jpg | The Spruce screenshot | Rust |
| dollar-spot-kbg | 03.jpg | Lawngevity | Necrotic Ring Spot |
| drought-fescue | 01.jpg | Lawngevity | Drought Stress (canonical) |
| drought-fescue | 02.jpg | Pexels 8143668 | Luxury estate + manicured lawn |
| bermuda-dormancy-winter | 01.jpg | The Spruce screenshot | Typhula Blight / Gray Snow Mold |
| bermuda-dormancy-winter | 02.jpg | Lawngevity | Dormant grass (canonical) |
| bermuda-dormancy-winter | 03.jpg | Lawngevity | Dormant grass alternate angle |
| recently-seeded-damping | 01.jpg | Kansas State (via Covington) | Pythium blight (canonical damping-off) |
| recently-seeded-damping | 02.jpg | Pexels 11653193 | Close-up lush green grass |
| recently-seeded-damping | 03.jpg | Pexels 2801070 | Vibrant green grass field |
| recently-seeded-damping | 04.jpg | Pexels 7587877 | Residential home + lawn |
| mixed-issue-lawn | 01.jpg | Pexels 29052548 | Suburban backyard + lawn |
| mixed-issue-lawn | 02.jpg | Pexels 16543179 | Close-up green grass |
| mixed-issue-lawn | 03.jpg | Lawngevity | Chinch bugs close-up |
| mixed-issue-lawn | 04.jpg | Pexels 280222 | Modern family home + lawn |
| partial-data-worstcase | 01.jpg | Pexels 166651 | Lush green grass field |
| partial-data-worstcase | 02.jpg | The Spruce screenshot | Slime mold (yellow patch) |
| partial-data-worstcase | 03.jpg | Lawngevity | Crabgrass (weed identification) |
| partial-data-worstcase | 04.jpg | Pexels 11654274 | Close-up green grass texture |

## Reference library (analysis/)

The `analysis/` subfolder contains 49+ additional reference photos covering
weeds (dandelion, clover, plantain, oxalis, henbit, spurge, ground ivy,
thistle, foxtail, wild onion, violets), grasses (tall fescue, bentgrass,
quackgrass), insects (billbug adult + larva, white grub, chinch bugs, sod
webworm, armyworm), diseases (powdery mildew, rust, leaf spot, summer patch,
red thread, snow mold), and lawn problems (mower damage, object burn, salt
damage, drought stress alternates). These are not currently used by the
12-scenario phase-1 harness but are available for future scenario expansion.
