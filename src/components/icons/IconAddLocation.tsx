import { SvgIcon, SxProps, Theme } from '@mui/material';

type IconProps = {
  color?: string;
  width?: number;
  height?: number;
  sx?: SxProps<Theme>;
  className?: string;
};

const IconAddLocation = ({
  color = '#222222',
  width = 24,
  height = 24,
  sx = {},
  className,
}: IconProps) => {
  return (
    <SvgIcon
      className={`organized-icon-add-location ${className}`}
      sx={{
        width: `${width}px`,
        height: `${height}px`,
        ...sx,
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 -960 960 960"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g>
          <path
            d="M480-99.62Q329-230.46 253.54-343.15q-75.46-112.7-75.46-206.93 0-138.46 89.57-224.19Q357.23-860 480-860h16.15q8.08 0 16.16 1.23v60.62q-8.08-1.23-15.75-1.73-7.68-.5-16.56-.5-102.92 0-172.42 70.46-69.5 70.46-69.5 179.84 0 72.54 62.27 169.04 62.27 96.5 179.65 201.58 116.61-104.31 178.69-199.85 62.08-95.54 63.23-168.07v-4.93h60v4.93q-1.15 93.84-76.42 205.76-75.27 111.93-225.5 242Zm51.11-407.03q21.2-21.26 21.2-51.11 0-29.85-21.26-51.05Q509.79-630 479.93-630q-29.85 0-51.04 21.26-21.2 21.26-21.2 51.12 0 29.85 21.26 51.04 21.26 21.19 51.12 21.19 29.85 0 51.04-21.26ZM480-557.69ZM720-640h60v-120h120v-60H780v-120h-60v120H600v60h120v120Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

export default IconAddLocation;
