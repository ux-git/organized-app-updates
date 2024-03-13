import { SvgIcon, SxProps, Theme } from '@mui/material';

type IconProps = {
  color?: string;
  width?: number;
  height?: number;
  sx?: SxProps<Theme>;
};

const IconEldersMeetings = ({ color = '#222222', width = 24, height = 24, sx = {} }: IconProps) => {
  return (
    <SvgIcon id="organized-icon-elders-meetings" sx={{ width: `${width}px`, height: `${height}px`, ...sx }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <mask
          id="mask0_5230_181686"
          style={{ maskType: 'alpha' }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="25"
        >
          <rect y="0.000488281" width="24" height="24" fill="#D9D9D9" />
        </mask>
        <g mask="url(#mask0_5230_181686)">
          <path
            d="M4.3077 20.5004C3.80257 20.5004 3.375 20.3254 3.025 19.9754C2.675 19.6254 2.5 19.1978 2.5 18.6927V8.30814C2.5 7.80301 2.675 7.37544 3.025 7.02544C3.375 6.67544 3.80257 6.50044 4.3077 6.50044H8.5V4.80816C8.5 4.30305 8.675 3.87549 9.025 3.52549C9.375 3.17549 9.80257 3.00049 10.3077 3.00049H13.6923C14.1974 3.00049 14.625 3.17549 14.975 3.52549C15.325 3.87549 15.5 4.30305 15.5 4.80816V6.50044H19.6923C20.1974 6.50044 20.625 6.67544 20.975 7.02544C21.325 7.37544 21.5 7.80301 21.5 8.30814V18.6927C21.5 19.1978 21.325 19.6254 20.975 19.9754C20.625 20.3254 20.1974 20.5004 19.6923 20.5004H4.3077ZM9.99998 6.50044H14V4.80816C14 4.73123 13.9679 4.66071 13.9038 4.59661C13.8397 4.5325 13.7692 4.50044 13.6923 4.50044H10.3077C10.2308 4.50044 10.1602 4.5325 10.0961 4.59661C10.032 4.66071 9.99998 4.73123 9.99998 4.80816V6.50044ZM20 14.7504H14.5V16.5004H9.5V14.7504H3.99998V18.6927C3.99998 18.7696 4.03202 18.8401 4.09613 18.9043C4.16024 18.9684 4.23077 19.0004 4.3077 19.0004H19.6923C19.7692 19.0004 19.8397 18.9684 19.9038 18.9043C19.9679 18.8401 20 18.7696 20 18.6927V14.7504ZM11 15.0004H13V13.0004H11V15.0004ZM3.99998 13.2504H9.5V11.5004H14.5V13.2504H20V8.30814C20 8.23121 19.9679 8.16068 19.9038 8.09656C19.8397 8.03246 19.7692 8.00041 19.6923 8.00041H4.3077C4.23077 8.00041 4.16024 8.03246 4.09613 8.09656C4.03202 8.16068 3.99998 8.23121 3.99998 8.30814V13.2504Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

export default IconEldersMeetings;