import { SvgIcon, SxProps, Theme } from '@mui/material';

type IconProps = {
  color?: string;
  width?: number;
  height?: number;
  sx?: SxProps<Theme>;
};

const IconCloudUpload = ({ color = '#222222', width = 24, height = 24, sx = {} }: IconProps) => {
  return (
    <SvgIcon id="organized-icon-cloud_upload" sx={{ width: `${width}px`, height: `${height}px`, ...sx }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <mask
          id="mask0_2621_40481"
          style={{ maskType: 'alpha' }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect y="0.500488" width="24" height="24" fill="#D9D9D9" />
        </mask>
        <g mask="url(#mask0_2621_40481)">
          <path
            d="M6.49998 20.0004C5.11794 20.0004 3.9391 19.521 2.96345 18.5622C1.98782 17.6034 1.5 16.4315 1.5 15.0466C1.5 13.8043 1.89968 12.7117 2.69905 11.7687C3.49842 10.8258 4.48976 10.2672 5.67308 10.0928C5.99359 8.59793 6.74519 7.37549 7.92788 6.42549C9.11056 5.47549 10.4679 5.00049 12 5.00049C13.8107 5.00049 15.3467 5.63115 16.608 6.89246C17.8693 8.15376 18.5 9.68976 18.5 11.5005V12.0005H18.8077C19.8615 12.0825 20.7403 12.5063 21.4442 13.2716C22.148 14.037 22.5 14.9466 22.5 16.0005C22.5 17.1158 22.1153 18.0613 21.3461 18.837C20.5769 19.6126 19.6346 20.0004 18.5192 20.0004H13.0577C12.5525 20.0004 12.125 19.8254 11.775 19.4754C11.425 19.1254 11.25 18.6979 11.25 18.1927V12.7158L9.39998 14.5351L8.34615 13.4908L12 9.83704L15.6538 13.4908L14.6 14.5351L12.75 12.7158V18.1927C12.75 18.2697 12.782 18.3402 12.8461 18.4043C12.9102 18.4684 12.9807 18.5005 13.0577 18.5005H18.5C19.2 18.5005 19.7916 18.2588 20.275 17.7755C20.7583 17.2921 21 16.7005 21 16.0005C21 15.3005 20.7583 14.7088 20.275 14.2255C19.7916 13.7421 19.2 13.5005 18.5 13.5005H17V11.5005C17 10.1171 16.5125 8.93796 15.5375 7.96296C14.5625 6.98796 13.3833 6.50046 12 6.50046C10.6166 6.50046 9.43748 6.98796 8.46248 7.96296C7.48748 8.93796 6.99998 10.1171 6.99998 11.5005H6.48075C5.53332 11.5005 4.71633 11.8421 4.02978 12.5255C3.34324 13.2088 2.99998 14.0338 2.99998 15.0005C2.99998 15.9671 3.34164 16.7921 4.02498 17.4755C4.70831 18.1588 5.53331 18.5005 6.49998 18.5005H8.99998V20.0004H6.49998Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

export default IconCloudUpload;