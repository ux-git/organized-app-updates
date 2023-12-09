import PropTypes from 'prop-types';
import { SvgIcon } from '@mui/material';

const IconPersonalDay = ({ color = '#222222', width = 24, height = 24, sx = {} }) => {
  width = width.toString();
  height = height.toString();

  return (
    <SvgIcon id="organized-icon-personal-day" sx={{ width: `${width}px`, height: `${height}px`, ...sx }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <mask
          id="mask0_2799_54674"
          style={{ maskType: 'alpha' }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <rect width="24" height="24" fill="#D9D9D9" />
        </mask>
        <g mask="url(#mask0_2799_54674)">
          <path
            d="M11.2501 5.21156V1.51929H12.75V5.21156H11.2501ZM17.3231 7.73079L16.2693 6.66734L18.8827 4.03851L19.9366 5.11734L17.3231 7.73079ZM18.7885 12.75V11.25H22.4808V12.75H18.7885ZM18.8827 19.9365L16.2693 17.3231L17.3328 16.2596L19.9616 18.8577L18.8827 19.9365ZM6.68665 7.74039L4.05395 5.10771L5.13277 4.04814L7.74045 6.68659L6.68665 7.74039ZM6.28855 19.0577H10.5962C11.077 19.0577 11.4889 18.8862 11.8318 18.5433C12.1748 18.2003 12.3462 17.7885 12.3462 17.3077C12.3462 16.8269 12.1805 16.4167 11.8491 16.0769C11.5177 15.7372 11.1116 15.5673 10.6308 15.5673H9.5097L9.07702 14.5308C8.83087 13.9551 8.44657 13.4984 7.92412 13.1606C7.40169 12.8227 6.82445 12.6538 6.1924 12.6538C5.31418 12.6538 4.56898 12.9599 3.9568 13.5721C3.34463 14.1843 3.03855 14.9295 3.03855 15.8077C3.03855 16.7115 3.35425 17.4792 3.98565 18.1106C4.61707 18.742 5.3847 19.0577 6.28855 19.0577ZM6.28855 20.5577C4.97573 20.5577 3.85587 20.0942 2.92895 19.1673C2.00203 18.2404 1.53857 17.1205 1.53857 15.8077C1.53857 14.5141 1.99082 13.4151 2.8953 12.5106C3.79978 11.6061 4.89882 11.1539 6.1924 11.1539C7.14752 11.1539 8.01674 11.4183 8.80007 11.9471C9.58341 12.476 10.1526 13.1827 10.5077 14.0673C11.4103 14.0673 12.1908 14.3728 12.8491 14.9837C13.5074 15.5945 13.8398 16.3968 13.8462 17.3904C13.8257 18.2763 13.502 19.0256 12.8751 19.6384C12.2482 20.2513 11.4885 20.5577 10.5962 20.5577H6.28855ZM13.827 17.1981C13.7629 16.9481 13.6988 16.7048 13.6347 16.4683C13.5706 16.2317 13.5065 15.9885 13.4424 15.7385C14.2116 15.4154 14.8302 14.9189 15.2981 14.2491C15.7661 13.5792 16.0001 12.8295 16.0001 12C16.0001 10.9 15.6084 9.95835 14.8251 9.17501C14.0417 8.39168 13.1001 8.00001 12.0001 8.00001C10.9808 8.00001 10.093 8.33623 9.3366 9.00866C8.5802 9.68111 8.14815 10.5269 8.04045 11.5462C7.79047 11.4821 7.53535 11.4231 7.2751 11.3693C7.01485 11.3154 6.75972 11.2564 6.50972 11.1923C6.70459 9.82824 7.32478 8.70516 8.3703 7.82311C9.4158 6.94106 10.6257 6.50004 12.0001 6.50004C13.5257 6.50004 14.8238 7.0353 15.8943 8.10581C16.9648 9.17631 17.5001 10.4744 17.5001 12C17.5001 13.1744 17.1638 14.2324 16.4914 15.174C15.819 16.1157 14.9308 16.7904 13.827 17.1981Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

IconPersonalDay.propTypes = {
  color: PropTypes.string,
  width: PropTypes.number,
  height: PropTypes.number,
  sx: PropTypes.object,
};

export default IconPersonalDay;
