import type { RegionalTool } from "./types";

export const REGIONAL_TOOLS: RegionalTool[] = [
  {
    stateCode: "CO",
    zipPrefixes: ["80", "81"],
    soilTempTool: {
      name: "CoAgMet",
      url: "coagmet.colostate.edu",
      ownedBy: "Colorado State University Extension",
    },
  },
  {
    stateCode: "AZ",
    zipPrefixes: ["85", "86"],
    soilTempTool: {
      name: "AZMet",
      url: "azmet.arizona.edu",
      ownedBy: "University of Arizona Cooperative Extension",
    },
  },
  {
    stateCode: "GA",
    zipPrefixes: ["30", "31", "39"],
    soilTempTool: {
      name: "GAEMN (Georgia Automated Environmental Monitoring Network)",
      url: "weather.uga.edu",
      ownedBy: "University of Georgia Extension",
    },
  },
  {
    stateCode: "AL",
    zipPrefixes: ["35", "36"],
    soilTempTool: {
      name: "AWIS / Alabama Mesonet",
      url: "awis.com",
      ownedBy: "Auburn University / Alabama Cooperative Extension",
    },
  },
  {
    stateCode: "SC",
    zipPrefixes: ["29"],
    soilTempTool: {
      name: "SC State Climatology Office",
      url: "scstateclimate.org",
      ownedBy: "Clemson Extension / SC DNR",
    },
  },
  {
    stateCode: "NC",
    zipPrefixes: ["27", "28"],
    soilTempTool: {
      name: "ECONet",
      url: "climate.ncsu.edu",
      ownedBy: "NC State Climate Office",
    },
  },
  {
    stateCode: "FL",
    zipPrefixes: ["32", "33", "34"],
    soilTempTool: {
      name: "FAWN (Florida Automated Weather Network)",
      url: "fawn.ifas.ufl.edu",
      ownedBy: "University of Florida IFAS Extension",
    },
  },
  {
    stateCode: "TX",
    zipPrefixes: ["75", "76", "77", "78", "79"],
    soilTempTool: {
      name: "TexMesonet",
      url: "texmesonet.org",
      ownedBy: "Texas Water Development Board / Texas A&M AgriLife",
    },
  },
  {
    stateCode: "TN",
    zipPrefixes: ["37", "38"],
    soilTempTool: {
      name: "UT Mesonet",
      url: "ag.tennessee.edu",
      ownedBy: "University of Tennessee Extension",
    },
  },
  {
    stateCode: "OH",
    zipPrefixes: ["43", "44", "45"],
    soilTempTool: {
      name: "OARDC Weather System",
      url: "oardc.osu.edu/weather",
      ownedBy: "Ohio State University Extension",
    },
  },
  {
    stateCode: "MI",
    zipPrefixes: ["48", "49"],
    soilTempTool: {
      name: "Enviroweather",
      url: "enviroweather.msu.edu",
      ownedBy: "Michigan State University Extension",
    },
  },
  {
    stateCode: "KS",
    zipPrefixes: ["66", "67"],
    soilTempTool: {
      name: "Kansas Mesonet",
      url: "mesonet.k-state.edu",
      ownedBy: "Kansas State University Extension",
    },
  },
  {
    stateCode: "MO",
    zipPrefixes: ["63", "64", "65"],
    soilTempTool: {
      name: "Missouri Mesonet",
      url: "agebb.missouri.edu/weather/mesonet",
      ownedBy: "University of Missouri Extension",
    },
  },
  {
    stateCode: "NY",
    zipPrefixes: ["10", "11", "12", "13", "14"],
    soilTempTool: {
      name: "NEWA (Network for Environment & Weather Applications)",
      url: "newa.cornell.edu",
      ownedBy: "Cornell Cooperative Extension",
    },
  },
  {
    stateCode: "CA",
    zipPrefixes: ["90", "91", "92", "93", "94", "95", "96"],
    soilTempTool: {
      name: "CIMIS (California Irrigation Management Information System)",
      url: "cimis.water.ca.gov",
      ownedBy: "California Department of Water Resources / UC Cooperative Extension",
    },
  },
];

export function findRegionalTool(zipCode: string | null | undefined): RegionalTool | null {
  if (!zipCode) return null;
  const prefix = zipCode.trim().slice(0, 2);
  if (!/^\d{2}$/.test(prefix)) return null;
  for (const tool of REGIONAL_TOOLS) {
    if (tool.zipPrefixes.includes(prefix)) return tool;
  }
  return null;
}
