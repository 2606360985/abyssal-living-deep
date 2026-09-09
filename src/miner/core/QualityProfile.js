const profiles = {
  high: { scatterScale: .5, steps: 40, snow: 6000, sediment: 1800, sonarScale: .5, shadowSize: 1024, shadowEvery: 1, bloom: .19 },
  medium: { scatterScale: .4, steps: 28, snow: 4000, sediment: 1100, sonarScale: .4, shadowSize: 768, shadowEvery: 2, bloom: .15 },
  low: { scatterScale: .3, steps: 18, snow: 2400, sediment: 600, sonarScale: .3, shadowSize: 512, shadowEvery: 3, bloom: .1 },
};
export function qualityProfile(name = 'high') { return { name: profiles[name] ? name : 'high', ...(profiles[name] || profiles.high) }; }
