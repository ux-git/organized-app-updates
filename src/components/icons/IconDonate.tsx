import { SvgIcon, SxProps, Theme } from '@mui/material';

type IconProps = {
  color?: string;
  width?: number;
  height?: number;
  sx?: SxProps<Theme>;
  className?: string;
};

const IconDonate = ({
  color = '#222222',
  width = 24,
  height = 24,
  sx = {},
  className,
}: IconProps) => {
  return (
    <SvgIcon
      className={`organized-icon-donate ${className}`}
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
          id="mask0_2515_25884"
          style={{ maskType: 'alpha' }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="25"
        >
          <rect y="0.000488281" width="24" height="24" fill="#D9D9D9" />
        </mask>
        <g mask="url(#mask0_2515_25884)">
          <path
            d="M15.8463 12.6927L11.8886 8.86391C11.4104 8.40238 11.0082 7.88863 10.6819 7.32266C10.3556 6.75668 10.1925 6.14031 10.1925 5.47356C10.1925 4.64771 10.4815 3.94574 11.0596 3.36764C11.6377 2.78954 12.3397 2.50049 13.1655 2.50049C13.7053 2.50049 14.2037 2.63062 14.6607 2.89089C15.1178 3.15116 15.513 3.48256 15.8463 3.88511C16.1797 3.48256 16.5748 3.15116 17.0319 2.89089C17.4889 2.63062 17.9873 2.50049 18.5271 2.50049C19.3529 2.50049 20.0549 2.78954 20.633 3.36764C21.2111 3.94574 21.5002 4.64771 21.5002 5.47356C21.5002 6.14031 21.3396 6.75668 21.0184 7.32266C20.6973 7.88863 20.2976 8.40238 19.8194 8.86391L15.8463 12.6927ZM15.8463 10.6043L18.706 7.83319C19.0419 7.50369 19.3415 7.14535 19.605 6.75816C19.8684 6.371 20.0002 5.9428 20.0002 5.47356C20.0002 5.06201 19.8575 4.71361 19.5723 4.42836C19.287 4.1431 18.9386 4.00046 18.5271 4.00046C18.2104 4.00046 17.9207 4.08315 17.6579 4.24854C17.395 4.41394 17.163 4.62356 16.9617 4.87741L15.8463 6.23506L14.731 4.87741C14.5297 4.62356 14.2976 4.41394 14.0348 4.24854C13.772 4.08315 13.4822 4.00046 13.1655 4.00046C12.754 4.00046 12.4056 4.1431 12.1203 4.42836C11.8351 4.71361 11.6924 5.06201 11.6924 5.47356C11.6924 5.9428 11.8242 6.371 12.0876 6.75816C12.3511 7.14535 12.6508 7.50369 12.9867 7.83319L15.8463 10.6043ZM6.70207 18.5774L13.9598 20.6312L19.929 18.7812C19.8777 18.5543 19.7719 18.3803 19.6117 18.2591C19.4514 18.138 19.27 18.0774 19.0675 18.0774H14.1702C13.7338 18.0774 13.363 18.0607 13.0579 18.0274C12.7527 17.9941 12.4393 17.921 12.1175 17.8082L9.8598 17.062L10.304 15.5928L12.329 16.2967C12.6316 16.3992 12.981 16.4691 13.3771 16.5063C13.7732 16.5435 14.3367 16.5672 15.0675 16.5774C15.0675 16.33 15.0117 16.1165 14.9002 15.937C14.7886 15.7576 14.6418 15.6364 14.4598 15.5736L8.65787 13.4428C8.63864 13.4364 8.62101 13.4316 8.60497 13.4284C8.58896 13.4252 8.57133 13.4236 8.5521 13.4236H6.70207V18.5774ZM1.70215 21.5004V11.9236H8.54077C8.64576 11.9236 8.75209 11.9351 8.85977 11.9582C8.96747 11.9813 9.06747 12.0082 9.15977 12.039L14.9867 14.1851C15.4405 14.3531 15.8174 14.6502 16.1174 15.0765C16.4174 15.5028 16.5674 16.0031 16.5674 16.5774H19.0675C19.7854 16.5774 20.3704 16.8092 20.8223 17.2726C21.2742 17.7361 21.5002 18.3377 21.5002 19.0774V19.8851L14.0098 22.212L6.70207 20.1274V21.5004H1.70215ZM3.20212 20.0005H5.20212V13.4236H3.20212V20.0005Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

export default IconDonate;
