type IconProps = { size?: number; className?: string }

const Svg = ({ size = 20, className, children }: IconProps & { children: React.ReactNode }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
)

export const PlayIcon = (props: IconProps) => <Svg {...props}><path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" /></Svg>
export const PauseIcon = (props: IconProps) => <Svg {...props}><path d="M9 5v14M15 5v14" strokeWidth="2.5" /></Svg>
export const PreviousIcon = (props: IconProps) => <Svg {...props}><path d="M6 5v14M18 6l-9 6 9 6Z" /></Svg>
export const NextIcon = (props: IconProps) => <Svg {...props}><path d="M18 5v14M6 6l9 6-9 6Z" /></Svg>
export const ListIcon = (props: IconProps) => <Svg {...props}><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></Svg>
export const VolumeIcon = (props: IconProps) => <Svg {...props}><path d="M11 5 6 9H3v6h3l5 4Z" /><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" /></Svg>
export const MutedIcon = (props: IconProps) => <Svg {...props}><path d="M11 5 6 9H3v6h3l5 4Z" /><path d="m16 10 5 5M21 10l-5 5" /></Svg>
export const RepeatIcon = (props: IconProps) => <Svg {...props}><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></Svg>
export const RepeatOneIcon = (props: IconProps) => <Svg {...props}><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /><path d="M12 10v5M10.5 11.5 12 10" /></Svg>
export const ShuffleIcon = (props: IconProps) => <Svg {...props}><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></Svg>
export const CloseIcon = (props: IconProps) => <Svg {...props}><path d="m6 6 12 12M18 6 6 18" /></Svg>
export const ArrowLeftIcon = (props: IconProps) => <Svg {...props}><path d="m15 18-6-6 6-6" /></Svg>
