import * as Tone from "tone";
import { soundDownloadProgress } from "./appState";
import {
  DrumSampler,
  piano_files,
  bass_files,
  hangdrum_files,
  drumkit_files,
  rescale,
  multiply_array_by,
  multiply_arrays,
  add_arrays,
  clamp,
  get_duration_from_volumes,
} from "./soundsUtils";

/**
 * Initializing the instrument sampler.
 * Note that I user a custom class for drum to map the
 * different sounds to note letters (see soundsUtils.js)
 */
const sampler_bass = new Tone.Sampler().toDestination();
const sampler_piano = new Tone.Sampler().toDestination();
const sampler_hangdrum = new Tone.Sampler().toDestination();
const sampler_drumkit = new DrumSampler();

/**
 * Initialize Tone.
 * Must be called on a user action involving
 * clicking, touching, etc.. (scroll is not enough)
 */
export async function initSampler() {
  await Tone.start();
  // Tone.Transport.bpm.value = 90
  Tone.Transport.loop = true;
  Tone.Transport.loopStart = 0;
  Tone.Transport.loopEnd = `0:${12}`;
  console.log("Tone is ready");
}

/**
 * Helper function to set Tone BPM
 * @param {number} bpm beats per minute
 */
export function setBPM(bpm) {
  Tone.Transport.bpm.set({ value: bpm });
}

/**
 * Function to convert a value between 0 and 1
 * into decibel attenuations.
 * It is not a realistic / physical attenuation, only
 * a good enough fake.
 * @param {number} volume a value between 0 and 1
 * @returns {number} decibel attenueation value between -Infinity and 0
 */
function getDecibels(volume) {
  return Math.log(volume ** 12);
}

/**
 * Set the global output volume of Tone.
 * @param {number} volume a value between 0 and 1
 */
export function setVolume(volume) {
  volume = getDecibels(volume);
  Tone.getDestination().volume.set({ value: volume });
}

/**
 * Load the sound samples files and monitor loading progress
 * using the soundDownloadProgress store accessible
 * throughout the application.
 */
export async function loadSamples() {
  const all_files = [
    ...Object.values(piano_files),
    ...Object.values(bass_files),
    ...Object.values(hangdrum_files),
    ...Object.values(drumkit_files),
  ].reduce((obj, cur) => ({ ...obj, [cur]: "downloading" }), {});

  const n_total = Object.keys(all_files).length;
  function monitorProgress(file) {
    if (all_files[file]) {
      all_files[file] = "done";
    }
    let n = Object.values(all_files).filter((f) => f === "done").length;
    soundDownloadProgress.update(() => n / n_total);
  }

  for (let file in piano_files) {
    sampler_piano.add(file, piano_files[file], () => {
      monitorProgress(piano_files[file]);
    });
  }
  for (let file in bass_files) {
    sampler_bass.add(file, bass_files[file], () => {
      monitorProgress(bass_files[file]);
    });
  }

  for (let file in hangdrum_files) {
    sampler_hangdrum.add(file, hangdrum_files[file], () => {
      monitorProgress(hangdrum_files[file]);
    });
  }
  for (let file in drumkit_files) {
    sampler_drumkit.add(file, drumkit_files[file], () => {
      monitorProgress(drumkit_files[file]);
    });
  }
}

/**
 * Create the Tone.Part object that contains the piano sounds put together in a sequence.
 * This function handles the mapping between "medium" value data and "volume"
 * value data to piano notes (pitch and velocity/volume).
 * @param {number[]} data_medium 12 values between 0 and 1, will be mapped to note pitch
 * @param {number[]} data_volume 12 unbounded values, will be mapped to note velocity
 * @param {Function} highlight_function function to call on each beat which takes an
 * index (between 0 and 11) corresponding to the current beat as its only parameter.
 * This function is typically used to synchronize changes in charts.
 * @param {string[]} scale an array containing note names (see soundsUtils.js)
 * @param {boolean} inverted_pitch should mapping be inverted/reversed? Default is false.
 * @returns A Tone.Part object containing the piano sound sequence.
 */
export function computeMeanMonthlyPart(
  data_medium,
  data_volume,
  highlight_function,
  scale,
  inverted_pitch = false
) {
  // data normalization
  const target_range = inverted_pitch ? [0.5, 1] : [0.6, 0.1];
  data_medium = rescale(data_medium, [0, 1], target_range);

  data_volume = rescale(data_volume, null, [0.02, 0.15]);

  const unit_duration = (12 / Tone.Transport.bpm.value) * 16;
  const duration = multiply_array_by(data_volume, 16);

  // mapping to a sound scale
  const n = scale.length;
  const steps = Array(n + 1)
    .fill(0)
    .map((e, i) => (i * 1) / n);
  const parts = data_medium.map((d, j) => {
    let note;
    for (let i = 0; i < n; i++) {
      if (d > steps[i] && d <= steps[i + 1]) {
        note = `${scale[i]}`;
        break;
      }
    }
    return {
      time: `0:${j}`,
      note: note,
      velocity: data_volume[j],
      index: j,
      duration: duration[j] * unit_duration,
    };
  });

  // create Part
  const part = new Tone.Part((time, value) => {
    const speed = value.duration;
    sampler_piano.triggerAttackRelease(value.note, speed, time, value.velocity);
    Tone.Draw.schedule(() => {
      highlight_function(value.index);
    });
  }, parts).start(0);

  return part;
}

/**
 * Create the Tone.Part object that contains the bass sounds put together in a sequence.
 * This function handles the mapping between "max" value data and bass notes.
 * @param {number[]} data_max 12 values between 0 and 1
 * @param {Function} highlight_function function to call on each beat which takes an
 * index (between 0 and 11) corresponding to the current beat as its only parameter.
 * This function is typically used to synchronize changes in charts.
 * @param {string[]} scale an array containing note names (see soundsUtils.js)
 * @returns A Tone.Part object containing the bass sound sequence.
 */
export function computeMaxMonthlyPart(data_max, highlight_function, scale) {
  let relative_var = rescale(data_max, null, [0, 1]);
  let absolute_var = data_max;
  const relative_weight = 1;
  const absolute_weight = 1;

  absolute_var = rescale(
    multiply_array_by(absolute_var, absolute_weight),
    [0, 1],
    [0.02, 0.4]
  ); // give the volume of each note
  relative_var = rescale(
    multiply_array_by(relative_var, relative_weight),
    null,
    [-0.1, 0]
  ); // modulated by the relative variation
  const combined_var = clamp(add_arrays(relative_var, absolute_var), [0.02, 1]);

  const unit_duration = (12 / Tone.Transport.bpm.value) * 6;
  const duration = get_duration_from_volumes(combined_var, 0.5);
  const volume = combined_var.map((d, i) => (data_max[i] === 0 ? 0 : d));

  data_max = rescale(data_max, [0, 1], [1, 0]);

  // mapping to a sound scale
  const n = scale.length;
  const steps = Array(n + 1)
    .fill(0)
    .map((e, i) => (i * 1) / n);
  const parts = data_max.map((d, j) => {
    let note;
    // if (!d) return null
    for (let i = 0; i < n; i++) {
      if (d > steps[i] && d <= steps[i + 1]) {
        note = `${scale[i]}`;
        break;
      }
    }
    // console.log(`Duration for month ${j} is ${duration[j] * unit_duration}`);
    return {
      time: `0:${j}`,
      note: note,
      velocity: volume[j],
      index: j,
      duration: duration[j] * unit_duration,
    };
  });
  // create Part
  const part = new Tone.Part(
    (time, value) => {
      sampler_bass.triggerAttackRelease(
        value.note,
        // (12 / Tone.Transport.bpm.value) * 4 * 4,
        value.duration,
        time,
        value.velocity
      );
      Tone.Draw.schedule(() => {
        highlight_function(value.index);
      });
    },
    parts.filter((p) => p)
  ).start(0);

  return part;
}

/**
 * Create the Tone.Part object that contains the hang drum sounds put together in a sequence.
 * This function handles the mapping between "min" value data and hang drum notes.
 * @param {number[]} data_min 12 values between 0 and 1
 * @param {Function} highlight_function function to call on each beat which takes an
 * index (between 0 and 11) corresponding to the current beat as its only parameter.
 * This function is typically used to synchronize changes in charts.
 * @param {string[]} scale an array containing note names (see soundsUtils.js)
 * @returns A Tone.Part object containing the hang drum sound sequence.
 */
export function computeMinMonthlyPart(data_min, highlight_function, scale) {
  let relative_var = rescale(data_min, null, [0, 1]);
  let absolute_var = data_min;
  const relative_weight = 1;
  const absolute_weight = 1;

  absolute_var = rescale(
    multiply_array_by(absolute_var, absolute_weight),
    [0, 1],
    [0.02, 0.3]
  ); // give the volume of each note
  relative_var = rescale(
    multiply_array_by(relative_var, relative_weight),
    null,
    [-0.1, 0]
  ); // modulated by the relative variation
  const combined_var = clamp(add_arrays(relative_var, absolute_var), [0.03, 1]);

  const volume = combined_var.map((d, i) => (data_min[i] === 0 ? 0 : d));
  data_min = rescale(data_min, [0, 1], [0.01, 1]);

  // const unit_duration = (12 / Tone.Transport.bpm.value) * 4 * 16
  const unit_duration = (12 / Tone.Transport.bpm.value) * 16;
  // const duration = get_duration_from_volumes(combined_var, 0.5);
  const duration = multiply_array_by(data_min, 12);

  // mapping to a sound scale
  const n = scale.length;
  const steps = Array(n + 1)
    .fill(0)
    .map((e, i) => (i * 1) / n);
  const parts = data_min.map((d, j) => {
    let note;
    for (let i = 0; i < n; i++) {
      if (d > steps[i] && d <= steps[i + 1]) {
        note = `${scale[i]}`;
        break;
      }
    }
    // console.log(`Duration for month ${j} is ${duration[j] * unit_duration}`);
    return {
      time: `0:${j}`,
      note: note,
      velocity: volume[j],
      index: j,
      duration: duration[j] * unit_duration,
    };
  });
  // create Part
  const part = new Tone.Part(
    (time, value) => {
      sampler_hangdrum.triggerAttackRelease(
        value.note,
        value.duration,
        time,
        value.velocity
      );
      Tone.Draw.schedule(() => {
        highlight_function(value.index);
      });
    },
    parts.filter((p) => p)
  ).start(0);

  return part;
}

/**
 * Create the drum sequence according to a specified pattern
 * (see PATTERN object in soundsUtils.js)
 * @param {object[]} pattern pattern array (see PATTERN)
 * @returns A Tone.Part object containing the drum sequence
 */
export function computeDrumMonthlyPart(pattern) {
  const volume_factor = 0.7;
  // parts
  const parts = Array(12)
    .fill("")
    .map((_, j) => {
      return { time: `0:${j}`, index: j };
    });
  // create Part
  const part = new Tone.Part((time, value) => {
    Object.keys(pattern[value.index]).map((drum_element) => {
      sampler_drumkit.triggerAttackRelease(
        drum_element,
        20,
        time,
        pattern[value.index][drum_element] * volume_factor
      );
    });
  }, parts).start(0);

  return part;
}

/**
 * Start Tone
 */
export function startSound() {
  if (Tone.Transport.state !== "started") Tone.Transport.start("+0.05");
}
/**
 * Pause Tone
 */
export function pauseSound() {
  if (Tone.Transport.state === "started") Tone.Transport.pause("+0.05");
}
/**
 * Stop Tone
 */
export function stopSound() {
  if (Tone.Transport.state !== "stopped") Tone.Transport.stop("+0.05");
}
