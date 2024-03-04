import { SvgIcon, SxProps, Theme } from '@mui/material';

type IconProps = {
  color?: string;
  width?: number;
  height?: number;
  sx?: SxProps<Theme>;
};

const IconManageAccess = ({ color = '#222222', width = 24, height = 24, sx = {} }: IconProps) => {
  return (
    <SvgIcon id="organized-icon-manage-access" sx={{ width: `${width}px`, height: `${height}px`, ...sx }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <mask
          id="mask0_2515_23643"
          style={{ maskType: 'alpha' }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect y="0.500488" width="24" height="24" fill="#D9D9D9" />
        </mask>
        <g mask="url(#mask0_2515_23643)">
          <path
            d="M10.7404 15.2505H13.2596L12.6942 12.0929C13.0083 11.9582 13.2612 11.747 13.4528 11.4592C13.6445 11.1714 13.7403 10.8518 13.7403 10.5006C13.7403 10.0211 13.5702 9.61115 13.2298 9.27076C12.8894 8.93038 12.4795 8.76019 12 8.76019C11.5205 8.76019 11.1106 8.93038 10.7702 9.27076C10.4298 9.61115 10.2596 10.0211 10.2596 10.5006C10.2596 10.8518 10.3554 11.1714 10.5471 11.4592C10.7388 11.747 10.9916 11.9582 11.3057 12.0929L10.7404 15.2505ZM12 21.9813C9.83716 21.3916 8.04646 20.1185 6.62787 18.1621C5.20929 16.2057 4.5 14.0185 4.5 11.6006V5.84674L12 3.03906L19.5 5.84674V11.6006C19.5 14.0185 18.7907 16.2057 17.3721 18.1621C15.9535 20.1185 14.1628 21.3916 12 21.9813ZM12 20.4006C13.7333 19.8506 15.1666 18.7506 16.3 17.1006C17.4333 15.4506 18 13.6172 18 11.6006V6.87556L12 4.63519L5.99997 6.87556V11.6006C5.99997 13.6172 6.56664 15.4506 7.69997 17.1006C8.83331 18.7506 10.2666 19.8506 12 20.4006Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

export default IconManageAccess;