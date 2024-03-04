import { SvgIcon, SxProps, Theme } from '@mui/material';

type IconProps = {
  color?: string;
  width?: number;
  height?: number;
  sx?: SxProps<Theme>;
};

const IconSpecialPioneer = ({ color = '#222222', width = 24, height = 24, sx = {} }: IconProps) => {
  return (
    <SvgIcon id="organized-icon-special-pioneer" sx={{ width: `${width}px`, height: `${height}px`, ...sx }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <mask
          id="mask0_3298_119084"
          style={{ maskType: 'alpha' }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect y="0.500488" width="24" height="24" fill="#D9D9D9" />
        </mask>
        <g mask="url(#mask0_3298_119084)">
          <path
            d="M9.2964 16.4045L12.0002 14.7642L14.7041 16.4045L13.9868 13.3296L16.3848 11.2623L13.2291 10.9969L12.0002 8.09689L10.7714 10.9969L7.61563 11.2623L10.0137 13.3296L9.2964 16.4045ZM12.0002 23.1084L8.86178 20.0007H4.50025V15.6392L1.39258 12.5007L4.50025 9.36227V5.00074H8.86178L12.0002 1.89307L15.1387 5.00074H19.5002V9.36227L22.6079 12.5007L19.5002 15.6392V20.0007H15.1387L12.0002 23.1084ZM12.0002 21.0007L14.5002 18.5007H18.0002V15.0007L20.5002 12.5007L18.0002 10.0007V6.50072H14.5002L12.0002 4.00072L9.50023 6.50072H6.00023V10.0007L3.50023 12.5007L6.00023 15.0007V18.5007H9.50023L12.0002 21.0007Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

export default IconSpecialPioneer;