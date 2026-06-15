const LOGO_SRC = "/yard-analyzer-logo-v2.png";
const LOGO_INTRINSIC_WIDTH = 200;
const LOGO_INTRINSIC_HEIGHT = 302;

interface LogoProps {
  className?: string;
}

export function Logo({ className = "h-8 w-auto" }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt="Yard Analyzer"
      width={LOGO_INTRINSIC_WIDTH}
      height={LOGO_INTRINSIC_HEIGHT}
      className={className}
    />
  );
}
