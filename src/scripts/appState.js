import { writable, derived, get } from "svelte/store";
import {
  meanMonthlyPS,
  maxMonthlyPS,
  minMonthlyPS,
  sizePS,
  drumPS,
} from "./dataProcessing";
import { setBPM, setVolume } from "./sounds";

/**
 * Download state for all sound files (between 0 and 1)
 */
export const soundDownloadProgress = writable(0);

/**
 * Download state for all sound files (between 0 and 1)
 */
export const currentStation = writable(null);

/**
 * Sound arrangement
 */
export const configuration = writable({
  arrangement: "Am",
  //   bpm: 90,
  bpm: 300,
  bpm_auto: true,
  inverted_pitch: false,
  volume: 0.8,
  med: true,
  max: true,
  min: true,
  drum: false,
  drum_pattern: "blues",
});

/**
 * Plots and Sounds (parts), derived from the selected station
 */
export const currentStationPS = derived(
  [currentStation, configuration],
  ([$currentStation, $configuration]) => {
    const stationPS = get(currentStationPS);
    if (!$currentStation) {
      if (stationPS) {
        if (stationPS.meanMonthlyPS) stationPS.meanMonthlyPS.part.dispose();
        if (stationPS.maxMonthlyPS) stationPS.maxMonthlyPS.part.dispose();
        if (stationPS.minMonthlyPS) stationPS.minMonthlyPS.part.dispose();
        if (stationPS.drumPS) stationPS.drumPS.part.dispose();
      }
      return {};
    }
    stationPS.meanMonthlyPS = meanMonthlyPS(
      $currentStation,
      stationPS.meanMonthlyPS,
      $configuration
    );
    stationPS.maxMonthlyPS = maxMonthlyPS(
      $currentStation,
      stationPS.maxMonthlyPS,
      $configuration
    );
    stationPS.minMonthlyPS = minMonthlyPS(
      $currentStation,
      stationPS.minMonthlyPS,
      $configuration
    );
    stationPS.sizePS = sizePS($currentStation, stationPS.sizePS);
    stationPS.drumPS = drumPS(stationPS.drumPS, $configuration);
    if ($configuration.bpm_auto && stationPS.sizePS.bpm != $configuration.bpm) {
      configuration.update((c) => ({ ...c, bpm: stationPS.sizePS.bpm }));
    }
    setBPM($configuration.bpm);
    setVolume($configuration.volume);
    return stationPS;
  },
  {}
);

/**
 * Contains the whole dataset.
 * The store includes two convenient functions:
 * - get a station given its ID
 * - get the information of all stations (FIXME: I think it is useless in the end...)
 */
function buildDatasetStore() {
  const { subscribe, set, update } = writable([]);
  function getStationById(station_id) {
    const dataset = get(datasetStore);
    const station = dataset.filter((s) => s.info.id === station_id);
    return station.length === 1 ? station[0] : null;
  }
  function getStationsInfo() {
    const dataset = get(datasetStore);
    return dataset.map((s) => s.info);
  }
  return { subscribe, set, update, getStationById, getStationsInfo };
}
export const datasetStore = buildDatasetStore();
// export const datasetSizes = writable(null)

/**
 * Download dataset and initialize associated store
 */
export async function downloadDataset() {
  // For large dataset, I might need to monitor the download
  // to display a progress bar to the user...
  // const file = await fetch("./example_data_raw_new.json");
  const file = await fetch("./GSIM.json");
  const dataset = await file.json();
  // convert the object into an array
  let dataset_array = Object.keys(dataset).map((key) => dataset[key]);
  console.log("Actual size of dataset: ", dataset_array.length);
  // adding an index and a "has_been_selected" attribute in the info of all stations
  dataset_array = dataset_array.map((d, i) => {
    d.info.index = i;
    d.info.has_been_selected = false;
    return d;
  });
  // selecting a random station
  centerStation.set(
    dataset_array[Math.floor(Math.random() * dataset_array.length)]
  );
  const sizes = dataset_array.map((d) => d.data.size);
  const max_size = Math.max(...sizes);
  const min_size = Math.min(...sizes);

  datasetStore.set(
    dataset_array.map((d) => {
      d.data.size = {
        min: min_size,
        max: max_size,
        val: d.data.size,
      };
      return d;
    })
  );
}

export const centerStation = writable(null);
export const mapStore = writable(null);

export const uiOptionPanel = writable(false);
export const uiPlotPanel = writable(true);
export const uiWelcomePanel = writable(true);
export const uiTutorial = writable(false);
export const uiInfoPanel = writable(false);

export const uiTutorialReady = derived(
  [centerStation, mapStore],
  ([$centerStation, $mapStore]) => {
    return $centerStation && $mapStore;
  },
  false
);
