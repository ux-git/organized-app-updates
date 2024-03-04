import { SvgIcon, SxProps, Theme } from '@mui/material';

type IconProps = {
  color?: string;
  width?: number;
  height?: number;
  sx?: SxProps<Theme>;
};

const IconComputer = ({ color = '#222222', width = 24, height = 24, sx = {} }: IconProps) => {
  return (
    <SvgIcon id="organized-icon-computer" sx={{ width: `${width}px`, height: `${height}px`, ...sx }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <mask
          id="mask0_2704_31558"
          style={{ maskType: 'alpha' }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect y="0.500488" width="24" height="24" fill="#D9D9D9" />
        </mask>
        <g mask="url(#mask0_2704_31558)">
          <path
            d="M8.5 21.0004V19.5005H10.5V17.5005H4.3077C3.80257 17.5005 3.375 17.3255 3.025 16.9755C2.675 16.6255 2.5 16.1979 2.5 15.6928V5.80819C2.5 5.30306 2.675 4.87549 3.025 4.52549C3.375 4.17549 3.80257 4.00049 4.3077 4.00049H19.6923C20.1974 4.00049 20.625 4.17549 20.975 4.52549C21.325 4.87549 21.5 5.30306 21.5 5.80819V15.6928C21.5 16.1979 21.325 16.6255 20.975 16.9755C20.625 17.3255 20.1974 17.5005 19.6923 17.5005H13.5V19.5005H15.5V21.0004H8.5ZM4.3077 16.0005H19.6923C19.7692 16.0005 19.8397 15.9684 19.9038 15.9043C19.9679 15.8402 20 15.7697 20 15.6928V5.80819C20 5.73126 19.9679 5.66073 19.9038 5.59661C19.8397 5.53251 19.7692 5.50046 19.6923 5.50046H4.3077C4.23077 5.50046 4.16024 5.53251 4.09613 5.59661C4.03202 5.66073 3.99998 5.73126 3.99998 5.80819V15.6928C3.99998 15.7697 4.03202 15.8402 4.09613 15.9043C4.16024 15.9684 4.23077 16.0005 4.3077 16.0005Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

export default IconComputer;