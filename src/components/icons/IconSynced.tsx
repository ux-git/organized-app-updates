import { SvgIcon, SxProps, Theme } from '@mui/material';

type IconProps = {
  color?: string;
  width?: number;
  height?: number;
  sx?: SxProps<Theme>;
  className?: string;
};

const IconSynced = ({
  color = '#222222',
  width = 24,
  height = 24,
  sx = {},
  className,
}: IconProps) => {
  return (
    <SvgIcon
      className={`organized-icon-synced ${className}`}
      sx={{ width: `${width}px`, height: `${height}px`, ...sx }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <mask
          id="mask0_2515_4555"
          style={{ maskType: 'alpha' }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="25"
        >
          <rect y="0.000488281" width="24" height="24" fill="#D9D9D9" />
        </mask>
        <g mask="url(#mask0_2515_4555)">
          <path
            d="M6.69629 12.3599L10.5751 16.2541L17.3039 9.52525L16.2501 8.45605L10.5751 14.1311L7.75011 11.3061L6.69629 12.3599Z"
            fill={color}
          />
          <path
            d="M10.75 21.4119C9.57303 21.2465 8.48202 20.891 7.4769 20.3455C6.47178 19.8 5.60032 19.1087 4.8625 18.2715C4.12468 17.4343 3.54648 16.4808 3.1279 15.4109C2.7093 14.3411 2.5 13.2042 2.5 12.0004C2.5 10.5222 2.80738 9.15262 3.42213 7.89172C4.03688 6.63082 4.91733 5.53884 6.06348 4.61577H3.375V3.11579H8.74995V8.49074H7.25V5.59267C6.20512 6.36447 5.40223 7.30549 4.84133 8.41574C4.28043 9.52601 3.99998 10.7209 3.99998 12.0004C3.99998 13.9799 4.63395 15.709 5.9019 17.1879C7.16983 18.6667 8.78585 19.5664 10.75 19.8869V21.4119ZM15.25 20.8945V15.5196H16.75V18.4177C17.7884 17.6292 18.5897 16.6824 19.1538 15.5773C19.7179 14.4722 20 13.2799 20 12.0004C20 10.0209 19.366 8.29172 18.0981 6.81287C16.8301 5.33403 15.2141 4.43436 13.25 4.11384V2.58887C15.6102 2.90938 17.5753 3.95201 19.1452 5.71674C20.715 7.48148 21.5 9.57602 21.5 12.0004C21.5 13.4786 21.1926 14.8497 20.5778 16.1138C19.9631 17.3779 19.0826 18.4715 17.9365 19.3946H20.625V20.8945H15.25Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

export default IconSynced;
