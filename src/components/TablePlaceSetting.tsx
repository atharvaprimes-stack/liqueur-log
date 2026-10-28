import Svg, { Circle, G, Path } from 'react-native-svg';

type TablePlaceSettingProps = {
  size: number;
  /** Frame, cutlery, flourishes — status / theme ink. */
  color: string;
  /** Solid plate disc behind the table number. */
  plateFill: string;
};

/**
 * Balanced place-setting mark:
 * centered plate, short thin cutlery with even gaps, light flourishes.
 */
export function TablePlaceSetting({ size, color, plateFill }: TablePlaceSettingProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Label frame — rounded plaque without deep side lobes */}
      <Path d={FRAME} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <Path
        d={FRAME_INNER}
        fill="none"
        stroke={color}
        strokeWidth="0.85"
        strokeLinejoin="round"
        opacity={0.5}
      />

      {/* Top flourish */}
      <G fill={color} stroke={color} strokeWidth="0.6" strokeLinecap="round">
        <Path d="M50 13.8c-.75.95-1.25 2-1.25 2.85 0 .8.5 1.2 1.25 1.2s1.25-.4 1.25-1.2c0-.85-.5-1.9-1.25-2.85z" stroke="none" />
        <Path d="M47.6 15.5c-.6.45-.95 1-.95 1.55 0 .4.22.65.65.65.45 0 .7-.3.7-.8 0-.45-.12-1-.4-1.4z" stroke="none" />
        <Path d="M52.4 15.5c.6.45.95 1 .95 1.55 0 .4-.22.65-.65.65-.45 0-.7-.3-.7-.8 0-.45.12-1 .4-1.4z" stroke="none" />
        <Path d="M44.2 17.6c-1.35.15-2.5.8-3.1 1.7" fill="none" />
        <Path d="M55.8 17.6c1.35.15 2.5.8 3.1 1.7" fill="none" />
      </G>

      {/* Bottom flourish */}
      <G fill={color} stroke={color} strokeWidth="0.6" strokeLinecap="round">
        <Path d="M50 86.2c-.75-.95-1.25-2-1.25-2.85 0-.8.5-1.2 1.25-1.2s1.25.4 1.25 1.2c0 .85-.5 1.9-1.25 2.85z" stroke="none" />
        <Path d="M47.6 84.5c-.6-.45-.95-1-.95-1.55 0-.4.22-.65.65-.65.45 0 .7.3.7.8 0 .45-.12 1-.4 1.4z" stroke="none" />
        <Path d="M52.4 84.5c.6-.45.95-1 .95-1.55 0-.4-.22-.65-.65-.65-.45 0-.7.3-.7.8 0 .45.12 1 .4 1.4z" stroke="none" />
        <Path d="M44.2 82.4c-1.35-.15-2.5-.8-3.1-1.7" fill="none" />
        <Path d="M55.8 82.4c1.35-.15 2.5-.8 3.1-1.7" fill="none" />
      </G>

      {/*
        Cutlery: same short band (y 41→59), centered on plate (y 50).
        Even gaps: frame ~18 | fork ~26 | gap | plate 34↔66 | gap | knife ~74 | frame ~82
      */}
      <G fill={color}>
        {/* Fork */}
        <Path d="M23.35 41h.7v5.4h-.7z" />
        <Path d="M24.6 41h.7v5.4h-.7z" />
        <Path d="M25.85 41h.7v5.4h-.7z" />
        <Path d="M27.1 41h.7v5.4h-.7z" />
        <Path d="M23.2 45.9h4.8v.85c0 .5-.35.9-.85 1v.35h-3.1v-.35c-.5-.1-.85-.5-.85-1z" />
        <Path d="M24.85 47.7h1.5v9.4c0 .55-.4.95-.75.95s-.75-.4-.75-.95z" />
        <Path d="M24.4 56.9h2.4v1.35c0 .3-.25.55-.55.55h-1.3c-.3 0-.55-.25-.55-.55z" />

        {/* Knife */}
        <Path d="M74.55 41.1c.7.1 1.15.75 1.15 1.55v7.35h-3.2V43.7c0-1.45.8-2.45 2.05-2.6z" />
        <Path d="M72.2 49.5h4.6v1.05c0 .28-.2.5-.48.5h-3.64c-.28 0-.48-.22-.48-.5z" />
        <Path d="M73.3 50.5h2.3v6.4c0 .55-.4.95-.7.95s-1.6-.4-1.6-.95z" />
        <Path d="M72.8 56.9h3.3v1.35c0 .3-.25.55-.55.55h-2.2c-.3 0-.55-.25-.55-.55z" />
      </G>

      {/* Tiny leaves under plate */}
      <Path d="M37.2 62c-1.35.55-2.45 1.55-2.9 2.65 1.2-.15 2.45-.9 3.25-1.85-.1-.3-.25-.55-.35-.8z" fill={color} />
      <Path d="M62.8 62c1.35.55 2.45 1.55 2.9 2.65-1.2-.15-2.45-.9-3.25-1.85.1-.3.25-.55.35-.8z" fill={color} />

      {/* Plate — centered focal point */}
      <Circle cx="50" cy="50" r={PLATE_RIM_RADIUS} fill="none" stroke={color} strokeWidth="1.55" />
      <Circle cx="50" cy="50" r={PLATE_WELL_RADIUS} fill={plateFill} />
      <Circle
        cx="50"
        cy="50"
        r={PLATE_WELL_RADIUS}
        fill="none"
        stroke={color}
        strokeWidth="0.65"
        opacity={0.28}
      />
    </Svg>
  );
}

/** Soft rounded plaque — no deep left/right lobes crowding the cutlery. */
const FRAME =
  'M20 22c0-6 5.5-11 14-11h32c8.5 0 14 5 14 11v56c0 6-5.5 11-14 11H34c-8.5 0-14-5-14-11V22z';

const FRAME_INNER =
  'M22.4 24c0-4.7 4.4-8.6 11.6-8.6h32c7.2 0 11.6 3.9 11.6 8.6v52c0 4.7-4.4 8.6-11.6 8.6h-32c-7.2 0-11.6-3.9-11.6-8.6V24z';

/** Plate geometry in the 100×100 viewBox — used to size the number. */
export const PLATE_WELL_RADIUS = 13.5;
export const PLATE_RIM_RADIUS = 16.2;
