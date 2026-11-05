<script lang="ts">
  import { Slider } from "bits-ui";

  /** A single-value slider: the track, the filled part and the knob are real elements (styled in app.css / ui-style.css), so the fill is
   *  right from the first render. `label` names it for assistive tech, since the visible text sits outside it. */
  let { value = $bindable(), min, max, step = 1, label }: { value: number; min: number; max: number; step?: number; label: string } = $props();
</script>

<Slider.Root type="single" bind:value {min} {max} {step} class="slider">
  <span class="slider-track"><Slider.Range class="slider-range" /></span>
  <Slider.Thumb index={0} class="slider-thumb" aria-label={label} />
</Slider.Root>
