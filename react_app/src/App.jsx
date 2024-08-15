import React from 'react'
import { useEffect, useState, useRef, Fragment } from 'react'
import './App.css'
import axios from 'axios'
import {
  MapContainer,
  TileLayer,
  useMap,
  Marker,
  Popup,
  Polygon,
  Polyline,
  Circle,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css';
import L, { map } from 'leaflet';
import Draggable from 'react-draggable';
import { Line } from 'react-chartjs-2';
import Chart from "chart.js/auto";
import { CategoryScale, plugins } from "chart.js";
import {
  averageDistanceCalc,
  pointToPointCalc,
  calculateConvexHull,
  averagedistanceCalcMultiPoints,
  avgDistanceFromCenter,
  calculateGeoCenter,
  findCapital,
} from './distances';
import Papa from 'papaparse';
import _, { sum } from 'lodash';

Chart.register(CategoryScale);

const vpWidth = window.innerWidth;

const calculateTeamIconSize = () => {
  if (vpWidth < 768) return 10;
  if (vpWidth < 1500) return 14;
  return 20;
};

const calculateConfIconSize = () => {
  if (vpWidth < 768) return 14;
  if (vpWidth < 1500) return 22;
  return 30;
};

const APIURL = 'https://api.cfbrealignment.com';
const TEAMLOGOSIZE = calculateTeamIconSize();
const CONFLOGOSIZE = calculateConfIconSize();
const AWSBUCKET = 'https://cfb-realignment-frontend.s3.us-east-2.amazonaws.com/';

const footballImage = AWSBUCKET + "static/dist/images/football.png";
const basketballImage = AWSBUCKET + "static/dist/images/basketball.png";
const playImage = AWSBUCKET + "static/dist/images/play.png";
const pauseImage = AWSBUCKET + "static/dist/images/pause.png";

const chartOptions = {
  aspectRatio: 1.7,
  plugins: {
    legend: {
      display: false,
    },
  },
  scales: {
    y: {
      title: {
        display: true,
        text: 'Miles',
        color: '#00254c',
        font: {
          size: 16
        }
      }
    },
  },
};

function App() {

  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [conferenceList, setConferenceList] = useState([])
  const [filteredConferenceList, setFilteredConferenceList] = useState([])
  const [summaryStatsConfObject, setSummaryStatsConfObject] = useState({})
  const [allSchools, setAllSchools] = useState([])


  const [conferenceIcons, setConferenceIcons] = useState({})
  const [conferenceLogos, setConferenceLogos] = useState({})
  const [schoolIcons, setSchoolIcons] = useState({})
  const [conferenceColors, setConferenceColors] = useState([])
  const [chartData, setChartData] = useState({})
  const [ballImages, setBallImages] = useState({})

  const [animate, setAnimate] = useState(false)
  const [redrawTimelineBool, setRedrawTimelineBool] = useState(false)
  const animateRef = useRef(animate)
  const [animationSpeed, setAnimationSpeed] = useState(500)
  const [mapDisplay, setMapDisplay] = useState({ teams: true, capitals: true, lines: true, confCountry: true, schoolCircles: false });
  const [confCountryOpacity, setConfCountryOpacity] = useState(0.5)
  const [confCountrySize, setConfCountrySize] = useState(100)

  const [conferenceNames, setConferenceNames] = useState(["SEC", "Big Ten", "ACC", "Big 12", "Pac 12", "Mountain West", "Sun Belt", "CUSA", "MAC", "AAC", "Big East", "NCAA"])
  const [conferenceObjects, setConferenceObjects] = useState([])
  const [historicalConferenceNames, setHistoricalConferenceNames] = useState(["SWC", "Big Eight", "WAC", "Big West", "Skyline", "Border"])
  const [selectedConferences, setSelectedConferences] = useState([])
  const [conferenceYears, setConferenceYears] = useState([])
  const [selectedYear, setSelectedYear] = useState('')
  const [sport, setSport] = useState('football')
  const [splitConference, setSplitConference] = useState(false)

  const [customConferenceMode, setCustomConferenceMode] = useState(false)
  const [customConfs, setCustomConfs] = useState([])
  const [selectedCustomConfs, setSelectedCustomConfs] = useState([])

  { /* API Calls */ }
  const getConferences = async () => {
    try {
      setIsLoading(true)
      const response = await axios.get(APIURL + '/api/conferencebyyear/')
      setConferenceList(response.data)

      let conferenceNameList = conferenceNames
      response.data.map((conference) => {
        conference.custom = false;
        conferenceNameList.includes(conference.conference) || historicalConferenceNames.includes(conference.conference) ? null :
          conferenceNameList.push(conference.conference)
      });
      setConferenceNames(conferenceNameList)

      setSelectedConferences([conferenceNameList[0], conferenceNameList[1]])

      setFilteredConferenceList(response.data.filter((conference) => conference.conference == conferenceNameList[0]))

      setSelectedYear(1932)

      const conferencesResponse = await axios.get(APIURL + '/api/conferences/')
      let logos = {};
      let colors = {};
      let modernConfs = []
      let historicalConfs = []
      conferencesResponse.data.forEach((conf) => {
        if (conferenceNames.includes(conf.name)) {
          modernConfs.push(conf)
        } else {
          historicalConfs.push(conf)
        }
      });
      const sortedModernConferences = modernConfs.sort((a, b) => {
        const indexA = conferenceNames.indexOf(a.name);
        const indexB = conferenceNames.indexOf(b.name);
        if (indexA > indexB) {
          return 1;
        }
        if (indexA < indexB) {
          return -1;
        }
        return 0;
      });
      const sortedHistoricalConferences = historicalConfs.sort((a, b) => {
        const indexA = historicalConferenceNames.indexOf(a.name);
        const indexB = historicalConferenceNames.indexOf(b.name);
        if (indexA > indexB) {
          return 1;
        }
        if (indexA < indexB) {
          return -1;
        }
        return 0;
      });
      setConferenceObjects([...sortedModernConferences, ...sortedHistoricalConferences]);
      conferencesResponse.data.forEach((conf) => {
        logos[conf.name] = conf.logo;
        colors[conf.name] = conf.colors;

      });
      setConferenceLogos(logos);
      setConferenceColors(colors);

      const confIconsPromises = conferencesResponse.data.map(async (logo) => {
        const dimensions = await getImageDimmensions(logo.logo, CONFLOGOSIZE);
        return { name: logo.name, icon: L.icon({ iconUrl: logo.logo, iconSize: dimensions }) };
      });
      const confIconsArray = await Promise.all(confIconsPromises);
      let confIcons = {};
      confIconsArray.forEach(item => {
        confIcons[item.name] = item.icon;
      });
      setConferenceIcons(confIcons);

      const responseSchools = await axios.get(APIURL + '/api/schools/')
      setAllSchools(responseSchools.data)
      const schoolIconsPromises = responseSchools.data.map(async (school) => {
        const dimensions = await getImageDimmensions(school.logo, TEAMLOGOSIZE);
        return { name: school.name, icon: L.icon({ iconUrl: school.logo, iconSize: dimensions }) };
      });
      const schoolIconsArray = await Promise.all(schoolIconsPromises);
      let schoolIcons = {};
      schoolIconsArray.forEach(item => {
        schoolIcons[item.name] = item.icon;
      });
      setSchoolIcons(schoolIcons);

      const loadBallImages = async () => {
        const footballImg = new Image();
        footballImg.src = footballImage;
        footballImg.width = 15;
        footballImg.height = 15;
        await new Promise((resolve, reject) => {
          footballImg.onload = resolve;
          footballImg.onerror = reject;
        });

        const basketballImg = new Image();
        basketballImg.src = basketballImage;
        basketballImg.width = 15;
        basketballImg.height = 15;
        await new Promise((resolve, reject) => {
          basketballImg.onload = resolve;
          basketballImg.onerror = reject;
        });
        setBallImages({ football: footballImg, basketball: basketballImg });
      }
      loadBallImages();

    } catch (error) {
      setHasError(true)
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  { /* Chart Builder */ }
  useEffect(() => {
    const setCharts = async () => {

      let selectedConferenceList = [];
      if (sport === 'football') {
        selectedConferenceList = conferenceList.filter((conference) =>
          selectedConferences.includes(conference.conference) && conference.football);
      } else {
        selectedConferenceList = conferenceList.filter((conference) =>
          selectedConferences.includes(conference.conference) && conference.basketball);
      }


      let conferenceCharts = {};

      selectedConferences.map((conferenceName) => {
        let conference = selectedConferenceList.filter((conference) => conference.conference == conferenceName);
        let confData = {
          labels: conference ? conference.map((conf) => conf.year) : [],
          datasets: [
            {
              label: 'Average Distance Between Schools',
              data: conference ? conference.map((conf) => conf.avgDistanceBetweenSchools) : [],
              pointStyle: conference ? conference.map((conf) =>
                conf.year === selectedYear ? sport === 'football' ? ballImages.football : ballImages.basketball : false) : [],
              borderColor: conferenceColors[conferenceName] ? conferenceColors[conferenceName].main : '#000',
            },
            {
              label: 'Average Distance from Center',
              data: conference ? conference.map((conf) => conf.avgDistanceFromCenter) : [],
              pointStyle: conference ? conference.map((conf) =>
                conf.year === selectedYear ? sport === 'football' ? ballImages.football : ballImages.basketball : false) : [],
              borderColor: conferenceColors[conferenceName] ? conferenceColors[conferenceName].light : '#000',
            },
          ],
        };
        conferenceCharts[conferenceName] = confData;
      });

      let totalYears = [];
      selectedConferenceList.map((conference) => {
        totalYears.includes(conference.year) ? null : totalYears.push(conference.year)
      });
      totalYears.sort();

      let summaryStats = {};
      totalYears.forEach((year) => {
        let currentConfs = selectedConferenceList.filter((conference) => conference.year === year);
        let avgDistance = Number((currentConfs.reduce((a, b) => a + Number(b.avgDistanceBetweenSchools), 0) / currentConfs.length).toFixed(2));
        let avgDistanceFromCenter = Number((currentConfs.reduce((a, b) => a + Number(b.avgDistanceFromCenter), 0) / currentConfs.length).toFixed(2));
        summaryStats[year] = { avgDistance, avgDistanceFromCenter };
      });

      let ncaaData = {
        labels: totalYears ? totalYears : [],
        datasets: [
          {
            label: 'Average Distance Between Schools',
            data: summaryStats ? totalYears.map((year) => summaryStats[year].avgDistance) : [],
            pointStyle: summaryStats ? totalYears.map((year) =>
              year === selectedYear ? sport === 'football' ? ballImages.football : ballImages.basketball : false) : [],
            borderColor: conferenceColors["NCAA"] ? conferenceColors["NCAA"].main : '#000'
          },
          {
            label: 'Average Distance from Center',
            data: summaryStats ? totalYears.map((year) => summaryStats[year].avgDistanceFromCenter) : [],
            pointStyle: summaryStats ? totalYears.map((year) =>
              year === selectedYear ? sport === 'football' ? ballImages.football : ballImages.basketball : false) : [],
            borderColor: conferenceColors["NCAA"] ? conferenceColors["NCAA"].dark : '#000'
          },
        ],
      }

      conferenceCharts['NCAA'] = ncaaData;
      if (summaryStats[selectedYear]) {
        const currentAvgDistanceBetweenNCAA = summaryStats[selectedYear].avgDistance;
        const currentAvgDistanceFromCenterNCAA = summaryStats[selectedYear].avgDistanceFromCenter;
        createSummaryConf(selectedYear, sport, currentAvgDistanceBetweenNCAA, currentAvgDistanceFromCenterNCAA)
      }

      setChartData(conferenceCharts);
    };
    setCharts().catch(console.error);
  }, [selectedConferences, sport, selectedYear]);

  const getImageDimmensions = (url, pixels) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        let aspectRatio = width / height;
        aspectRatio > 3 ? pixels *= .7 : null;
        img.width > img.height ? resolve([Math.round(pixels * aspectRatio), pixels]) : resolve([pixels, Math.round(pixels / aspectRatio)]);
      };
      img.onerror = () => {
        reject('error');
      };
    });
  };

  useEffect(() => {
    getConferences()
  }, [])

  const createSummaryConf = (yearVar, sportVar, avgDistanceBetween, avgDistanceFromCenter) => {
    const schoolList = filteredConferenceList.map((conference) => conference.schools).flat();
    let confObject = {
      id: 0,
      year: yearVar,
      conference: "NCAA",
      football: sportVar === 'football' ? true : false,
      basketball: sportVar === 'basketball' ? true : false,
      schools: schoolList,
      avgDistanceBetweenSchools: avgDistanceBetween,
      avgDistanceFromCenter: avgDistanceFromCenter,
      custom: false,
    }
    setSummaryStatsConfObject(confObject)
  }

  const sportHandler = (e) => {
    const button = e.target.closest('button');
    const sport = button.textContent.toLowerCase().trim();
    setSport(sport)
  }

  const splitConferenceMonitor = () => {
    let split = false;
    filteredConferenceList.map((conference) => {
      conference.football && conference.basketball ? null : split = true
    });
    setSplitConference(split)
  }

  const selectConferenceHandler = (e) => {
    setAnimate(false)
    const button = e.target.closest('button');
    const conferenceName = button.getAttribute('data-conf-name');
    let newConferenceList = []
    switch (conferenceName) {
      case 'Power 5':
        newConferenceList = ['SEC', 'Big Ten', 'ACC', 'Big 12', 'Pac 12']
        break;
      case "Power 4":
        newConferenceList = ['SEC', 'Big Ten', 'ACC', 'Big 12']
        break;
      case "Group of 5":
        newConferenceList = ['Mountain West', 'Sun Belt', 'CUSA', 'MAC']
        break;
      case "Big 2":
        newConferenceList = ['SEC', 'Big Ten']
        break;
      case "Basketball Conferences":
        newConferenceList = ["Big East", "ACC", "Big Ten", "Big 12"]
        setSport('basketball')
        break;
      case "NCAA":
        newConferenceList = ["SEC", "Big Ten", "ACC", "Big 12", "Pac 12", "Mountain West", "Sun Belt", "CUSA", "MAC", "AAC", "SWC", "Big Eight", "WAC", "Big West", "Skyline", "Border", "Big East"]
        break;
      default:
        conferenceName == "Big East" ? setSport('basketball') : null
        selectedConferences.includes(conferenceName) ? newConferenceList = selectedConferences.filter((conf) => conf !== conferenceName) : newConferenceList = [...selectedConferences, conferenceName]
        newConferenceList.length === 0 ? newConferenceList = [conferenceName] : null
        break;
    }
    setSelectedConferences(newConferenceList)
    setRedrawTimelineBool(true)
  }

  const preprogrammedAnimationsHandler = (e) => {
    const button = e.target.closest('button');
    const animation = button.getAttribute('data-anim-name');
    switch (animation) {
      case 'All of CFB History':
        setCustomConfs([]);
        setSelectedConferences(['SEC', 'Big Ten', 'ACC', 'Big 12', 'Pac 12', 'Mountain West', 'Sun Belt', 'CUSA', 'MAC', 'AAC', "SWC", "Big Eight", "WAC", "Big West", "Skyline", "Border"]);
        yearMapButtonHandler(1896);
        setMapDisplay({ teams: false, capitals: true, lines: true, confCountry: true, schoolCircles: false });
        setConfCountryOpacity(0.9);
        setConfCountrySize(50);
        setAnimationSpeed(500);
        setTimeout(() => {
          setAnimate(true);
        }, 2000);
        break;
      case 'Modern Expansion':
        setCustomConfs([]);
        setSelectedConferences(['SEC', 'Big Ten', 'Big 12', 'Pac 12', 'ACC']);
        yearMapButtonHandler(2001);
        setMapDisplay({ teams: false, capitals: true, lines: true, confCountry: true, schoolCircles: false });
        setConfCountryOpacity(0.5);
        setConfCountrySize(50);
        setAnimationSpeed(500);
        setTimeout(() => {
          setAnimate(true);
        }, 2000);
        break;
      case 'Death of the Pac 12':
        setCustomConfs([]);
        setSelectedConferences(['Pac 12', 'Big Ten', 'Big 12', 'ACC']);
        yearMapButtonHandler(2023);
        setMapDisplay({ teams: false, capitals: true, lines: true, confCountry: true, schoolCircles: false });
        setConfCountryOpacity(0.8);
        setConfCountrySize(100);
        setAnimationSpeed(1000);
        setTimeout(() => {
          setAnimate(true);
        }, 2000);
        break;
      case 'CUSA & The Sun Belt: A Wild Ride':
        setCustomConfs([]);
        setSelectedConferences(['CUSA', 'Sun Belt']);
        yearMapButtonHandler(1989);
        setMapDisplay({ teams: false, capitals: true, lines: true, confCountry: true, schoolCircles: false });
        setConfCountryOpacity(0.8);
        setConfCountrySize(50);
        setAnimationSpeed(300);
        setTimeout(() => {
          setAnimate(true);
        }, 2000);
        break
      case 'Big 2 since 32':
        setCustomConfs([]);
        setSelectedConferences(['SEC', 'Big Ten']);
        yearMapButtonHandler(1932);
        setMapDisplay({ teams: false, capitals: true, lines: true, confCountry: true, schoolCircles: false });
        setConfCountryOpacity(0.8);
        setConfCountrySize(100);
        setAnimationSpeed(100);
        setTimeout(() => {
          setAnimate(true);
        }, 2000);
        break;
      case 'Truly Mid-American':
        setCustomConfs([]);
        setSelectedConferences(['MAC']);
        yearMapButtonHandler(1946);
        setMapDisplay({ teams: true, capitals: false, lines: false, confCountry: true, schoolCircles: false });
        setConfCountryOpacity(0.8);
        setConfCountrySize(150);
        setAnimationSpeed(100);
        setTimeout(() => {
          setAnimate(true);
        }, 2000);
        break;
      case 'What is the Big 12?':
        setCustomConfs([]);
        setSelectedConferences(['Big 12']);
        yearMapButtonHandler(1996);
        setMapDisplay({ teams: true, capitals: true, lines: true, confCountry: true, schoolCircles: false });
        setConfCountryOpacity(0.6);
        setConfCountrySize(150);
        setTimeout(() => {
          yearMapButtonHandler(2024);
        }, 3000);
        break;
      default:
        break;
    }
  }

  const selectYearHandler = (year) => {
    setSelectedYear(year)
  }

  const yearSearch = (e) => {
    let year = e.target.value;
    if (year.length == 4 && !isNaN(year) && year >= conferenceYears[0] && year <= conferenceYears[conferenceYears.length - 1]) {
      setSelectedYear(Number(year))
      setRedrawTimelineBool(true)
    }
  }

  const yearMapButtonHandler = (year) => {
    setSelectedYear(Number(year))
    setRedrawTimelineBool(true)
  }

  const conferenceFilter = () => {
    if (sport == 'football') {
      let filteredList = conferenceList.filter((conference) => {
        return conference.year == selectedYear && selectedConferences.includes(conference.conference) && conference.football
      })
      setFilteredConferenceList(filteredList)
    } else {
      let filteredList = conferenceList.filter((conference) => {
        return conference.year == selectedYear && selectedConferences.includes(conference.conference) && conference.basketball
      })
      setFilteredConferenceList(filteredList)
    };
    splitConferenceMonitor()
  }

  useEffect(() => {
    conferenceFilter()
  }, [selectedYear, sport, selectedConferences])

  useEffect(() => {
    let years = []
    conferenceList.map((conference) => {
      selectedConferences.includes(conference.conference) && !years.includes(conference.year) ? years.push(conference.year) : null
    });
    years.sort()
    setConferenceYears(years)
    years.includes(Number(selectedYear)) ? conferenceFilter() : setSelectedYear(years[0])
  }, [selectedConferences])

  const animationHandler = () => {
    setAnimate(!animate)
  }

  useEffect(() => {
    let interval;
    if (animate) {
      let i = conferenceYears.indexOf(selectedYear) + 1;
      interval = setInterval(() => {
        if (i >= conferenceYears.length) {
          clearInterval(interval);
          setAnimate(false);
        } else {
          setSelectedYear(conferenceYears[i]);
          setRedrawTimelineBool(true);
          i++;
        }
      }, animationSpeed);
    }
    return () => clearInterval(interval);
  }, [animate, animationSpeed]);

  const autoScrollSpeedHandler = (value) => {
    const newSpeed = value === 'increase' ? Math.min(animationSpeed + 100, 1500) : Math.max(animationSpeed - 100, 100);
    setAnimationSpeed(newSpeed);
  }

  const handleMapDisplay = (value) => {
    switch (value) {
      case 'capitals':
        setMapDisplay({ teams: mapDisplay.teams, capitals: !mapDisplay.capitals, lines: mapDisplay.lines, confCountry: mapDisplay.confCountry });
        break;
      case 'teams':
        setMapDisplay({ teams: !mapDisplay.teams, capitals: mapDisplay.capitals, lines: mapDisplay.lines, confCountry: mapDisplay.confCountry });
        break;
      case 'lines':
        setMapDisplay({ teams: mapDisplay.teams, capitals: mapDisplay.capitals, lines: !mapDisplay.lines, confCountry: mapDisplay.confCountry });
        break;
      case 'confCountry':
        setMapDisplay({ teams: mapDisplay.teams, capitals: mapDisplay.capitals, lines: mapDisplay.lines, confCountry: !mapDisplay.confCountry });
        break;
      case 'schoolCircles':
        setMapDisplay({ teams: mapDisplay.teams, capitals: mapDisplay.capitals, lines: mapDisplay.lines, confCountry: mapDisplay.confCountry, schoolCircles: !mapDisplay.schoolCircles });
      default:
        break;
    }
  };

  const handleConfCountryOpacity = (value) => {
    if (value === 'increase') {
      setConfCountryOpacity(parseFloat((Math.min(confCountryOpacity + 0.1, 1)).toFixed(1)));
    } else {
      setConfCountryOpacity(parseFloat((Math.max(confCountryOpacity - 0.1, 0.1)).toFixed(1)));
    }
  }

  const handleConfCountrySize = (value) => {
    if (value === 'increase') {
      setConfCountrySize(Math.min((confCountrySize + 10), 300));
    } else {
      setConfCountrySize(Math.max((confCountrySize - 10), 50));
    }
  }

  const handleCustomConfMode = () => {
    setCustomConferenceMode(!customConferenceMode)
  }

  const handleCustomConfs = (conf) => {
    let customConfsNew = [...customConfs, conf];
    setCustomConfs(customConfsNew);
  }

  const handleSelectCustomConfs = (e) => {
    let selectedCustomConfsNew = [];
    const button = e.target.closest('button');
    const confName = button.getAttribute('data-conf-name');
    const conf = customConfs.filter((customConf) => customConf.conference === confName)[0];
    if (selectedCustomConfs.includes(conf)) {
      selectedCustomConfsNew = selectedCustomConfs.filter((selectedConf) => selectedConf !== conf);
    } else {
      selectedCustomConfsNew = [...selectedCustomConfs, conf];
    }
    setSelectedCustomConfs(selectedCustomConfsNew);
  }

  var myIcon = L.icon({
    iconUrl: APIURL + '/media/images/conf_logos/ncaa.png',
    iconSize: [10, 10],
  });

  return (
    <>
      {isLoading ?
        <div>
          <img src={AWSBUCKET + "static/dist/images/football_backdrop.jpg"} className='backdrop' />
          <p className='loading' style={{ color: "white" }}>Loading...</p>
        </div>
        :
        <>
          <img src={sport == 'football' ? AWSBUCKET + 'static/dist/images/football_backdrop.jpg' : AWSBUCKET + 'static/dist/images/basketball_backdrop.webp'} className='backdrop' />

          <AboutPopup />
          <BuildConferencePopUp
            conferenceNames={conferenceNames}
            historicalConferenceNames={historicalConferenceNames}
            schools={allSchools}
            setCustomConferenceMode={handleCustomConfMode}
            allConferences={conferenceList}
            confObjects={conferenceObjects}
            customConfsHandler={handleCustomConfs}
            currentCustomConferences={customConfs} />
          <div className='main-app-container'>
            <NavBar conferenceNames={conferenceNames}
              historicalConferenceNames={historicalConferenceNames}
              conferenceYears={conferenceYears}
              selectConference={selectConferenceHandler}
              searchYears={yearSearch}
              conferenceLogosObject={conferenceLogos}
              selectedYear={selectedYear}
              sportHandler={sportHandler}
              splitConference={splitConference}
              selectedConferences={selectedConferences}
              sport={sport}
              preprogrammedAnimations={preprogrammedAnimationsHandler}
              customConferences={customConfs}
              selectCustomConference={handleSelectCustomConfs} />
            <div className='row map-chart-row'>
              <div className='col-12 col-md-7'>
                <div className="map-container">
                  <Map filteredConferenceList={filteredConferenceList}
                    conferenceIcons={conferenceIcons}
                    schoolIcons={schoolIcons}
                    selectedConferences={selectedConferences}
                    mapElements={mapDisplay}
                    confColors={conferenceColors}
                    countryOpacity={confCountryOpacity}
                    confCountrySize={confCountrySize}
                    customConferences={selectedCustomConfs} />
                  <DraggableTimeline
                    years={conferenceYears}
                    setYear={selectYearHandler}
                    selectedYear={selectedYear}
                    redraw={redrawTimelineBool}
                    setRedraw={setRedrawTimelineBool}
                    setAnimate={setAnimate} />
                  <MapControls
                    setAnimation={animationHandler}
                    animate={animate} firstYear={conferenceYears[0]}
                    lastYear={conferenceYears[conferenceYears.length - 1]}
                    setYear={yearMapButtonHandler}
                    selectedConferences={selectedConferences}
                    setAutoScrollSpeed={autoScrollSpeedHandler}
                    setMapDisplayOptions={handleMapDisplay}
                    animationSpeed={animationSpeed}
                    mapDisplayOptions={mapDisplay}
                    confCountryOpacity={confCountryOpacity}
                    setConfCountryOpacity={handleConfCountryOpacity}
                    confCountrySize={confCountrySize}
                    setConfCountrySize={handleConfCountrySize} />
                </div>
                <div className='school-list-container'>
                  <TeamList filteredConferenceList={filteredConferenceList} conferenceLogosObject={conferenceLogos} schoolIcons={schoolIcons} customConferences={selectedCustomConfs} />
                </div>
              </div>
              <div className='col-12 col-md-5'>
                <DetailsSidebar
                  filteredConferenceList={filteredConferenceList}
                  conferenceLogos={conferenceLogos}
                  conferenceColors={conferenceColors}
                  selectedConferences={selectedConferences}
                  selectedYear={selectedYear}
                  yearMapButtonHandler={yearMapButtonHandler}
                  chartData={chartData}
                  ncaaConfObject={summaryStatsConfObject}
                  customConferences={selectedCustomConfs} />
              </div>
            </div>
          </div>
        </>
      }
    </>
  )
}

function BuildConferencePopUp({ conferenceNames, historicalConferenceNames, schools, allConferences, confObjects, customConfsHandler, currentCustomConferences }) {
  schools = schools.sort((a, b) => a.name.localeCompare(b.name))
  const [selectedSchools, setSelectedSchools] = useState([])
  const [selectedSchoolsCoords, setSelectedSchoolsCoords] = useState([])
  const [selectedSchoolsDistBetween, setSelectedSchoolsDistBetween] = useState(0)
  const [selectedSchoolsDistFromCenter, setSelectedSchoolsDistFromCenter] = useState(0)
  const [selectedYear, setSelectedYear] = useState(2024)
  const [selectedConf, setSelectedConf] = useState(null)
  const [availablConfs, setAvailableConfs] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [confName, setConfName] = useState(null)
  const [GeoCenter, setGeoCenter] = useState([null, null])
  const [capital, setCapital] = useState(null)
  const [colors, setColors] = useState({ "dark": "#000000", "main": "#CC2E28", "light": "#588AAE" })
  const [majorCities, setMajorCities] = useState(null)

  const allYears = Array.from({ length: 2025 - 1896 }, (_, i) => 1896 + i);

  const handleColorChange = (e) => {
    const { name, value } = e.target;
    setColors((prevColors) => ({
      ...prevColors,
      [name]: value,
    }));
  };

  const addSchoolHandler = (schoolName) => {
    const school = schools.filter((school) => school.name === schoolName)[0];
    selectedSchools.includes(school) ? setSelectedSchools(selectedSchools.filter((school) => school !== schoolName)) : setSelectedSchools([...selectedSchools, school])
  }

  const removeSchoolHandler = (e) => {
    const button = e.target.closest('button');
    const schoolName = button.getAttribute('data-team-name');
    setSelectedSchools(selectedSchools.filter((school) => school.name !== schoolName))
  }

  const removeAllSchoolsHandler = () => {
    setSelectedSchools([])
  }

  const selectedYearHandler = (year) => {
    setSelectedYear(year)
  }

  const selectedConfHandler = (e) => {
    const button = e.target.closest('button');
    const confName = button.getAttribute('data-conf-name');
    setSelectedConf(confName)
  }

  const buildConferenceHandler = () => {
    confName == null ? setConfName("Custom Conference" + currentCustomConferences.length + 1) : null

    let confObject = {
      id: 0,
      year: selectedYear,
      conference: selectedConf,
      football: true,
      basketball: true,
      schools: selectedSchools,
      avgDistanceBetweenSchools: selectedSchoolsDistBetween,
      avgDistanceFromCenter: selectedSchoolsDistFromCenter,
      conference: !confName ? "Custom Conference " + (currentCustomConferences.length + 1) : confName,
      custom: true,
      centerLat: GeoCenter[0],
      centerLon: GeoCenter[1],
      capital: capital,
      colors: colors,
    }
    customConfsHandler(confObject)
    setSelectedSchools([])
    setSelectedConf(null)
    document.querySelector('#customConfCloseButton').click();
  }

  const updateConfName = (e) => {
    setConfName(e.target.value)
  }

  useEffect(() => {
    let currentConfs = [
      ...conferenceNames.filter(conference => conference.firstYear <= selectedYear && conference.lastYear >= selectedYear),
      ...historicalConferenceNames.filter(conference => conference.firstYear <= selectedYear && conference.lastYear >= selectedYear)
    ];
    setAvailableConfs(currentConfs)

    async function readCSVFile(filePath) {
      const response = await fetch(filePath);
      const csvText = await response.text();

      return new Promise((resolve, reject) => {
        Papa.parse(csvText, {
          header: true,
          dynamicTyping: true,
          complete: (results) => {
            resolve(results.data);
          },
          error: (error) => {
            reject(error);
          },
        });
      });
    }

    (async () => {
      try {
        const filePath = AWSBUCKET + 'static/dist/assets/majorCities.txt'; // Adjust the path as necessary
        const csvData = await readCSVFile(filePath);
        setMajorCities(csvData);
      } catch (error) {
        console.error('Error reading or parsing the CSV file:', error);
      }
    })();

  }, [])

  useEffect(() => {
    if (selectedConf === null) {
      return
    }

    const currentConf = confObjects.filter(conference => conference.name === selectedConf)[0]

    if (currentConf.firstYear > selectedYear || currentConf.lastYear < selectedYear) {
      return
    }

    let confSchools = allConferences.filter((conference) => conference.conference === selectedConf && conference.year === selectedYear)[0].schools
    let schools = []
    confSchools.map((school) => {
      schools.push(school)
    })
    setSelectedSchools(schools)

    let currentConfs = [
      ...confObjects.filter(conference => conference.firstYear <= selectedYear && conference.lastYear >= selectedYear),
      ...confObjects.filter(conference => conference.firstYear <= selectedYear && conference.lastYear >= selectedYear)
    ];
    setAvailableConfs(currentConfs)
  }, [selectedYear, selectedConf])

  useEffect(() => {
    let coords = [];
    selectedSchools.map((school) => {
      coords.push([Number(school.latitude), Number(school.longitude)])
    });
    setSelectedSchoolsCoords(coords)
    if (coords.length > 1) {
      let center = calculateGeoCenter(coords)
      setGeoCenter(center);
      let capital = findCapital(center, majorCities);
      setCapital(capital);
      setSelectedSchoolsDistBetween(Math.round(averagedistanceCalcMultiPoints(coords, "degrees")));
      setSelectedSchoolsDistFromCenter(Math.round(avgDistanceFromCenter(coords)));
    } else {
      setGeoCenter([null, null]);
      setSelectedSchoolsDistBetween(0);
      setSelectedSchoolsDistFromCenter(0);
      setCapital(null);
    }
  }, [selectedSchools])

  return (
    <>
      {
        isModalOpen && (
          <div className='modal fade' id='customConfPopup' tabIndex="-1" role="dialog" aria-labelledby="customConfPopupLabel" aria-hidden="true">
            <div className="modal-dialog" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <div className='close-button-container'>
                    <button id="customConfCloseButton" type='button' className='close-button' data-dismiss="modal" aria-label="Close">X</button>
                  </div>
                  <h2 className='modal-title'>Build Your Own Conference</h2>
                </div>
                <div className="modal-body">

                  <div className='row school-list-row'>
                    <div className='col-12 col-md-6'>
                      <h3>Schools</h3>
                      <div className='school-list'>
                        <table className='school-table'>
                          <tbody>
                            {schools.map((school) => (
                              <tr
                                key={school.id + school.name + "-team-list"}
                                className={`team-list-table-row`}
                                onClick={() => addSchoolHandler(school.name)}
                                style={{ cursor: 'pointer' }}
                              >
                                <td><img src={school.logo} alt={school.name} className='team-list-schoollogo' /></td>
                                <td>{school.name}</td>
                                <td>{school.city}, {school.state}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className='col-12 col-md-6'>
                      <h3>
                        Selected Schools
                        <span className='remove-all-button-container'><button onClick={removeAllSchoolsHandler} className='remove-all-button'>Remove All</button></span>
                      </h3>
                      <div className='school-list'>
                        <table className='school-table'>
                          <tbody>
                            {selectedSchools.map((school) => (
                              <tr key={school.id + school.name + "-custom-selected"} className='custom-team-list-table-row'>
                                <td><img src={school.logo} alt={school.name} className='custom-team-list-schoollogo' /></td>
                                <td>{school.name}</td>
                                <td>{school.city}, {school.state}</td>
                                <td><button onClick={removeSchoolHandler} className='remove-button' data-team-name={school.name}>Remove</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className='row custom-conf-bottom-row'>
                    <div className='col-12 col-md-6'>
                      <div className='conference-list'>
                        <h4>Existing Conferences</h4>
                        <p>You can use a current or historical conference alignment as a blueprint.
                          Just select a conference and year to get started</p>
                        <DraggableTimeline
                          years={allYears}
                          setYear={selectedYearHandler}
                          selectedYear={selectedYear}
                          redraw={false}
                          setRedraw={() => { }}
                          setAnimate={() => { }} />
                        <div className='custom-conf-img-bay'>
                          {confObjects.map((conference) => (
                            conference.name !== 'NCAA' &&
                            <button
                              key={conference.name + "-custom"}
                              className='custom-conf-img-button'
                              data-conf-name={conference.name}
                              onClick={selectedConfHandler}
                              disabled={!(conference.firstYear <= selectedYear && conference.lastYear >= selectedYear)}>
                              <img src={conference.logo} alt={conference.name}
                                className={!(conference.firstYear <= selectedYear && conference.lastYear >= selectedYear) ? 'custom-conference-selection-img gray-out' : 'custom-conference-selection-img'} />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className='col-12 col-md-6'>
                      <h3><input type='text' placeholder='Your Conference Name Here' onChange={updateConfName}></input></h3>
                      <div className='conference-details-specific'>
                        <table className='conference-details-table'>
                          <tbody>
                            <tr>
                              <td className='conference-details-category'>Number of Schools</td>
                              <td className='conference-details-item'>{selectedSchools.length}</td>
                            </tr>
                            <tr>
                              <td className='conference-details-category'>
                                Avg. Distance Between Schools
                              </td>
                              <td className='conference-details-item'>
                                {selectedSchools.length > 1 ? selectedSchoolsDistBetween : 0} miles
                              </td>
                            </tr>
                            <tr>
                              <td className='conference-details-category'>
                                Avg. Distance from GeoCenter
                              </td>
                              <td className='conference-details-item'>
                                {selectedSchools.length > 1 ? selectedSchoolsDistFromCenter : 0} miles</td>
                            </tr>
                            <tr>
                              <td className='conference-details-category'>
                                Capital
                              </td>
                              <td className='conference-details-item'>
                                {capital ? `${capital.city}, ${capital.state}` : 'N/A'}
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <div className='color-selector-container'>
                          <h4>Conference Colors</h4>
                          <div className='color-selectors'>
                            <label className='color-label'>
                              Main Color:
                              <input
                                type='color'
                                name='main'
                                value={colors.main}
                                onChange={handleColorChange}
                                className='color-input'
                              />
                            </label>
                            <label className='color-label'>
                              Light Color:
                              <input
                                type='color'
                                name='light'
                                value={colors.light}
                                onChange={handleColorChange}
                                className='color-input'
                              />
                            </label>
                          </div>
                        </div>
                        <div className='custom-conf-submit-button-container'>
                          <button onClick={buildConferenceHandler} className='custom-conf-submit-button'>Build Conference</button>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div >
        )
      }
    </>
  )
}

function DetailsSidebar({ filteredConferenceList, conferenceLogos, conferenceColors, selectedConferences, selectedYear, yearMapButtonHandler, chartData, ncaaConfObject, customConferences }) {
  const [orderedConferences, setOrderedConferences] = useState([])
  const [filteredChartData, setFilteredChartData] = useState(null)
  const [avgDistanceBetween, setAvgDistanceBetween] = useState(true)
  const [avgDistanceFromCenter, setAvgDistanceFromCenter] = useState(true)
  const [combinedCharts, setCombinedCharts] = useState(null)

  useEffect(() => {
    if (avgDistanceBetween && avgDistanceFromCenter) {
      setFilteredChartData(_.cloneDeep(chartData))
    } else if (avgDistanceBetween && !avgDistanceFromCenter) {
      let newChartData = _.cloneDeep(chartData)
      for (let conference in newChartData) {
        newChartData[conference].datasets = newChartData[conference].datasets.filter((dataset) => dataset.label !== "Average Distance from Center")
      }
      setFilteredChartData(newChartData)
    } else if (!avgDistanceBetween && avgDistanceFromCenter) {
      let newChartData = _.cloneDeep(chartData)
      for (let conference in newChartData) {
        newChartData[conference].datasets = newChartData[conference].datasets.filter((dataset) => dataset.label !== "Average Distance Between Schools")
      }
      setFilteredChartData(newChartData)
    }
  }, [chartData, avgDistanceBetween, avgDistanceFromCenter])

  useEffect(() => {
    let currentConferences = filteredConferenceList.map((conference) => conference.conference);
    let outOfRange = [];
    let current = [];
    selectedConferences.forEach((conference) => {
      currentConferences.includes(conference) ? current.push(conference) : outOfRange.push(conference);
    });
    setOrderedConferences([...current, ...outOfRange]);
  }, [filteredConferenceList, selectedConferences]);

  function avgDistanceBetweenHandler() {
    !avgDistanceFromCenter ? setAvgDistanceFromCenter(true) : setAvgDistanceBetween(!avgDistanceBetween)
  }

  function avgDistanceFromCenterHandler() {
    !avgDistanceBetween ? setAvgDistanceBetween(true) : setAvgDistanceFromCenter(!avgDistanceFromCenter)
  }


  return (
    <div className='chart-details-container'>
      <nav className="navbar conference-details-navbar" >
        <div className="container-fluid ">
          <div className="navbar-brand">Conference Data</div >
          <ul>
            <li className="nav-item dropdown" key="sidebarOptionDropDown">
              <a className="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button"
                data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                Chart Controls
              </a>
              <div className="dropdown-menu sidebar-dropdown-menu" aria-labelledby="navbarDropdown">
                <ul className='sidebar-dropdown-list'>
                  <li className="nav-item" key="avgDistanceBetweenButton">
                    <button onClick={(e) => { e.stopPropagation(); avgDistanceBetweenHandler()}} className='sidebar-control-button'>
                      Distance Between Schools
                    </button>
                    {avgDistanceBetween ? <span className='sidebar-control-indicator'>✓</span> : null}
                  </li>
                  <li className="nav-item" key="avgDistanceFromCenterButton">
                    <button onClick={(e) => { e.stopPropagation(); avgDistanceFromCenterHandler()}} className='sidebar-control-button'>
                      Distance from Center
                    </button>
                    {avgDistanceFromCenter ? <span className='sidebar-control-indicator'>✓</span> : null}
                  </li>
                </ul>
              </div>
            </li>
          </ul>
        </div>
      </nav>
      <div className='conference-details-details'>
        {orderedConferences.map((conference) => {
          if (filteredChartData == null || !filteredChartData[conference]) {
            return <p key={conference}>Loading...</p>;
          }
          let startYear = Number(chartData[conference].labels[0]);
          let endYear = Number(chartData[conference].labels[chartData[conference].labels.length - 1]);

          return chartData[conference] && startYear <= selectedYear && endYear >= selectedYear ? (
            <div key={conference + "-details"} className='ind-conf-detail-container' style={{ backgroundColor: `${conferenceColors[conference].light}10`, }}>
              <ConferenceDetails
                conference={filteredConferenceList.filter((conferenceObject) => conferenceObject.conference === conference)[0]}
                confLogos={conferenceLogos}
                confColors={conferenceColors}
                selectedConference={conference}
                avgDistanceBetweenBoolean={avgDistanceBetween}
                avgDistanceFromCenterBoolean={avgDistanceFromCenter} />
              <div className='chart-container'>
                {filteredChartData ? <Line data={filteredChartData[conference]} options={chartOptions} /> : null}
              </div>
            </div>
          ) : (
            <div key={conference + "-details"} className='ind-conf-detail-container' style={{ backgroundColor: `${conferenceColors[conference].light}10`, }}>
              <ConferenceDetails
                conference={filteredConferenceList.filter((conferenceObject) => conferenceObject.conference === conference)[0]}
                confLogos={conferenceLogos}
                confColors={conferenceColors}
                selectedConference={conference}
                selectedYear={selectedYear}
                startYear={startYear}
                endYear={endYear}
                setYear={yearMapButtonHandler}
                avgDistanceBetweenBoolean={avgDistanceBetween}
                avgDistanceFromCenterBoolean={avgDistanceFromCenter} />
            </div>
          );
        })}
        <div key={"NCAA-details"} className='ind-conf-detail-container' style={{ backgroundColor: `${conferenceColors["NCAA"].light}10`, }}>
          <ConferenceDetails
            conference={ncaaConfObject}
            confLogos={conferenceLogos}
            confColors={conferenceColors}
            selectedConference={"NCAA"}
            selectedYear={selectedYear}
            numberOfConf={filteredConferenceList.length}
            avgDistanceBetweenBoolean={avgDistanceBetween}
            avgDistanceFromCenterBoolean={avgDistanceFromCenter}
          />
          <div className='chart-container'>
            {filteredChartData ? <Line data={filteredChartData["NCAA"]} options={chartOptions} /> : null}
          </div>
        </div>
        {customConferences.map((conf) => {
          return (
            <div key={conf.id + "-details"} className='ind-conf-detail-container' style={{ backgroundColor: `${conf.colors.light}10`, }}>
              <ConferenceDetails
                conference={conf}
              />
            </div>
          )
        })
        }
      </div>
    </div >
  )
}

function TeamList({ filteredConferenceList, conferenceLogosObject, schoolIcons, customConferences }) {
  const [allTeams, setAllTeams] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);

  const selectTeamHandler = (teamName) => {
    selectedTeams.includes(teamName) ? setSelectedTeams(selectedTeams.filter((team) => team !== teamName)) : setSelectedTeams([...selectedTeams, teamName])
  }

  useEffect(() => {
    let teams = [];
    filteredConferenceList.map((conference) => {
      conference.schools.map((school) => {
        teams.push(school.name)
      })
    });
    setAllTeams(teams);
  }, [filteredConferenceList])

  useEffect(() => {
    selectedTeams.filter((team) => !allTeams.includes(team)).length > 0 ? setSelectedTeams(selectedTeams.filter((team) => allTeams.includes(team))) : null
  }, [allTeams])

  return (
    <div className='team-list'>
      {filteredConferenceList.map((conference) => (
        <div className='team-list-conf' key={conference.id + "-team-list"}>
          <img
            src={conferenceLogosObject[conference.conference]}
            alt={conference.conference}
            className='team-list-conflogo'
            style={{
              height: conference.schools.length <= 6 ? "7rem" : null,
              width: conference.schools.length <= 6 ? "auto" : null
            }} />
          <div className='team-list-schools'>
            <table className='team-list-table'>
              <thead>
                <tr>
                  <th>{conference.conference}</th>
                </tr>
              </thead>
              <tbody>
                {conference.schools.map((school) => (
                  <React.Fragment key={school.id + school.name + "-team-list"}>
                    {selectedTeams.includes(school.name) ? <SchoolDetails school={school} schoolIcons={schoolIcons} conferenceEra={conference} selectTeamHandler={selectTeamHandler} />
                      :
                      <tr onClick={() => selectTeamHandler(school.name)} data-team-name={school.name}
                        className='team-list-table-row'>
                        <td><img src={schoolIcons[school.name].options.iconUrl} alt={school.name} className='team-list-schoollogo' /></td>
                        <td>{school.name}</td>
                        <td>{school.city}, {school.state}</td>
                      </tr>}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {customConferences.map((conference) => {
        return (
          <div className='team-list-conf'>
            <div className='team-list-schools'>
              <table className='team-list-table'>
                <thead>
                  <tr>
                    <th>{conference.conference}</th>
                  </tr>
                </thead>
                <tbody>
                  {conference.schools.map((school) => (
                    <>
                      {selectedTeams.includes(school.name) ? <SchoolDetails school={school} schoolIcons={schoolIcons} conferenceEra={conference} selectTeamHandler={selectTeamHandler} />
                        :
                        <tr onClick={() => selectTeamHandler(school.name)} data-team-name={school.name}
                          className='team-list-table-row' key={school.id}>
                          <td><img src={schoolIcons[school.name].options.iconUrl} alt={school.name} className='team-list-schoollogo' /></td>
                          <td>{school.name}</td>
                          <td>{school.city}, {school.state}</td>
                        </tr>
                      }
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
      )}
    </div>
  )
}

function SchoolDetails({ school, schoolIcons, conferenceEra, selectTeamHandler }) {
  let otherSchools = conferenceEra.schools.filter((schoolObject) => schoolObject.name !== school.name);
  let otherSchoolCoord = otherSchools.map((schoolObject) => [schoolObject.latitude, schoolObject.longitude]);
  let schoolCoord = [school.latitude, school.longitude];
  let capitalCoord = [conferenceEra.capital.latitude, conferenceEra.capital.longitude];
  let avgDistance = averageDistanceCalc(schoolCoord, otherSchoolCoord, "degrees");
  let distanceToCapital = pointToPointCalc(schoolCoord[0], schoolCoord[1], capitalCoord[0], capitalCoord[1], "degrees");

  return (
    <div className='school-details' key={school.name + "team-list-selected"}>
      <div onClick={() => selectTeamHandler(school.name)} data-team-name={school.name} className='team-list-table-row'>
        <h3>
          <img src={schoolIcons[school.name].options.iconUrl} alt={school.name} className='school-details-schoollogo' />
          {school.name}
        </h3>
      </div>
      <table className='conference-details-table'>
        <tbody>
          <tr>
            <td className='conference-details-category'>Location</td>
            <td className='conference-details-item'>{school.city}, {school.state}</td>
          </tr>
          <tr>
            <td className='conference-details-category'>Avg Distance to Other Schools</td>
            <td className='conference-details-item'>{avgDistance.toFixed()} mi</td>
          </tr>
          <tr>
            <td className='conference-details-category'>Distance From Capital</td>
            <td className='conference-details-item'>{distanceToCapital.toFixed()} mi</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function ChartControls({ avgDistanceBetween, avgDistanceFromCenter, setAvgDistanceBetween, setAvgDistanceFromCenter }) {
  return (
    <nav className="navbar" >
      <div className="container-fluid ">
        <li className="nav-item drop">
          <button onClick={setAvgDistanceBetween} className='chart-control-button'>
            Avg. Distance Between Schools
          </button>
        </li>
        <li className="nav-item button-container">
          <button onClick={setAvgDistanceFromCenter} className='chart-control-button'>
            Avg. Distance from Center
          </button>
        </li>

      </div>
    </nav>
  )
};

function MapControls({ setAnimation, animate, firstYear, lastYear, setYear, selectedConferences, setAutoScrollSpeed, setMapDisplayOptions, mapDisplayOptions, animationSpeed, confCountryOpacity, setConfCountryOpacity, confCountrySize, setConfCountrySize }) {
  return (
    <nav className="navbar map-controls">
      <div className="container-fluid">
        <li className="nav-item button-container">
          <button onClick={() => setYear(firstYear)} className='first-year-button'>
            {firstYear}
          </button>
          <button onClick={() => setYear(lastYear)} className='present-button'>
            {lastYear}
          </button>
        </li>
        <AutoScrollButton setAnimation={setAnimation} animate={animate} />
        <li className="nav-item dropdown more-circle">
          <a className="nav-link more-button more-button-container" href="#" id="navbarDropdown" role="button"
            data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"><img src={AWSBUCKET + "static/dist/images/settings.png"} className='setting-icon' /></a>
          <ul className="dropdown-menu dropdown-menu-up more-map-menu" aria-labelledby="navbarDropdown">

            <h3 className='map-controls-header'>Map Controls</h3>

            <button className='btn btn-secondary map-more-control' onClick={(e) => { e.stopPropagation(); setMapDisplayOptions("confCountry"); }}>
              Show "{selectedConferences.length > 1 ? "Conference Countries" : `${selectedConferences[0]} Country`}" {mapDisplayOptions.confCountry ? <span className='option-check'>&#10003;</span> : null}
            </button>

            <button value="schoolCircles" className='btn btn-secondary map-more-control' onClick={(e) => { e.stopPropagation(); setMapDisplayOptions("schoolCircles"); }}>
              Show School Circles {mapDisplayOptions.schoolCircles ? <span className='option-check'>&#10003;</span> : null}
            </button>

            <button value="both" className='btn btn-secondary map-more-control' onClick={(e) => { e.stopPropagation(); setMapDisplayOptions("lines"); }}>
              Show Lines to Capital {mapDisplayOptions.lines ? <span className='option-check'>&#10003;</span> : null}
            </button>

            <button value="capitalsonly" className='btn btn-secondary map-more-control' onClick={(e) => { e.stopPropagation(); setMapDisplayOptions("capitals"); }}>
              Show Capitals {mapDisplayOptions.capitals ? <span className='option-check'>&#10003;</span> : null}
            </button>

            <button value="teamsonly" className='btn btn-secondary map-more-control' onClick={(e) => { e.stopPropagation(); setMapDisplayOptions("teams"); }}>
              Show Teams {mapDisplayOptions.teams ? <span className='option-check'>&#10003;</span> : null}
            </button>

            <div className='map-more-control'>
              <p>Opacity</p>
              <div className='map-control-plusminus-container'>
                <button className='plusminus-btn' onClick={(e) => { e.stopPropagation(); setConfCountryOpacity("increase"); }}>+</button>
                <button className='plusminus-btn' onClick={(e) => { e.stopPropagation(); setConfCountryOpacity("decrease"); }}>-</button>
                <div className='plusminus-display'>{`${confCountryOpacity}`}</div>
              </div>
            </div>

            <div className='map-more-control'>
              <p>Circle Size</p>
              <div className='map-control-plusminus-container'>
                <button className='plusminus-btn' onClick={(e) => { e.stopPropagation(); setConfCountrySize("increase"); }}>+</button>
                <button className='plusminus-btn' onClick={(e) => { e.stopPropagation(); setConfCountrySize("decrease"); }}>-</button>
                <div className='plusminus-display'>{`${confCountrySize} mi`}</div>
              </div>
            </div>

            <div className='map-more-control'>
              <p>AutoScroll Speed</p>
              <div className='map-control-plusminus-container'>
                <button className='plusminus-btn' onClick={(e) => { e.stopPropagation(); setAutoScrollSpeed("increase"); }}>+</button>
                <button className='plusminus-btn' onClick={(e) => { e.stopPropagation(); setAutoScrollSpeed("decrease"); }}>-</button>
                <div className='plusminus-display'>{`${animationSpeed / 1000} s`}</div>
              </div>
            </div>

          </ul>
        </li>

      </div>
    </nav>
  )
}

function AutoScrollButton({ setAnimation, animate }) {
  return (
    <button onClick={setAnimation} className='nav-item autoscroll-button'>
      <p>Autoscroll </p>
      {animate ? <img src={pauseImage} /> : <img src={playImage} />}
    </button>
  )
}

function NavBar({ conferenceNames, historicalConferenceNames, selectConference, searchYears, conferenceLogosObject, sportHandler, selectedConferences, sport, preprogrammedAnimations, customConferences, selectCustomConference }) {

  return (
    <>
      <nav className="navbar navbar-main navbar-expand-lg" >
        <div className="container-fluid">
          <div className="navbar-brand"> CFB Realignment Center</div >
          <button className="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarSupportedContent"
            aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
            <img src={AWSBUCKET + "static/dist/images/menu.png"} alt="hamburger" className='navbar-toggler-img' />
          </button >
          <div className="collapse navbar-collapse" id="navbarSupportedContent" >
            <ul className="navbar-nav me-auto mb-2 mb-lg-0">
              <li className="nav-item">
                <button id="aboutButton" type='button' data-toggle="modal" data-target="#aboutPopup" className='nav-link custom-conf-button'>
                  About
                </button>
              </li>
              <li className="nav-item dropdown">
                <a className="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button"
                  data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                  Conferences
                </a>
                <div className="dropdown-menu" aria-labelledby="navbarDropdown">
                  <h6 className="dropdown-header">Modern</h6>
                  <div className="conf-select-container">
                    <ul className="list-inline dropdown-menu-conferences">
                      {conferenceNames.map((conferenceName) => (
                        conferenceName !== 'NCAA' &&
                        <li key={conferenceName} className='list-inline-item'>
                          <button
                            style={{ height: "3.9rem", backgroundColor: selectedConferences.includes(conferenceName) ? "#f1f1f1" : 'white' }}
                            onClick={(e) => { e.stopPropagation(); selectConference(e) }}
                            data-conf-name={conferenceName}
                            className='dropdown-item'>
                            <img src={conferenceLogosObject[conferenceName]} alt={conferenceName}
                              className='conference-selection-img' />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <h6 className="dropdown-header">Historic</h6>
                  <div className="conf-select-container">
                    <ul className="list-inline dropdown-menu-conferences">
                      {historicalConferenceNames.map((conferenceName) => (
                        <li key={conferenceName} className='list-inline-item'>
                          <button
                            style={{ height: "3.9rem", backgroundColor: selectedConferences.includes(conferenceName) ? "#f1f1f1" : 'white' }}
                            onClick={(e) => { e.stopPropagation(); selectConference(e) }}
                            data-conf-name={conferenceName}
                            className='dropdown-item'>
                            <img src={conferenceLogosObject[conferenceName]} alt={conferenceName}
                              className='conference-selection-img' />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <h6 className="dropdown-header">Select All</h6>
                  <div className="conf-select-container">
                    <ul className="list-inline dropdown-menu-conferences">
                      <li key={'NCAA'} className='list-inline-item'>
                        <button
                          style={{ height: "3.9rem", backgroundColor: selectedConferences.includes('NCAA') ? "#f1f1f1" : 'white' }}
                          onClick={(e) => { e.stopPropagation(); selectConference(e) }}
                          data-conf-name='NCAA'
                          className='dropdown-item'>
                          <img src={conferenceLogosObject['NCAA']} alt='NCAA'
                            className='conference-selection-img' />
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>
              </li>
              <li className="nav-item dropdown">
                <a className="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button"
                  data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                  Sports
                </a>
                <ul className="dropdown-menu" aria-labelledby="navbarDropdown">
                  <li key={'football'} className='dropdown-item'>
                    <button onClick={sportHandler} className='dropdown-item'>
                      <img src={footballImage} alt='football' className='sport-selection-img' /> Football
                      {sport == "football" ? <span className='option-check'>&#10003;</span> : null}
                    </button>
                  </li>
                  <li key={'basketball'} className='dropdown-item'>
                    <button onClick={sportHandler} className='dropdown-item'>
                      <img src={basketballImage} alt='basketball' className='sport-selection-img' /> Basketball
                      {sport == "basketball" ? <span className='option-check'>&#10003;</span> : null}
                    </button>
                  </li>
                </ul>
              </li>
              <li className="nav-item dropdown">
                <a className="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button"
                  data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                  QuickSelect
                </a>
                <ul className="dropdown-menu quickselect-dropdown" aria-labelledby="navbarDropdown">
                  <li><h6 className="dropdown-header">Conferences</h6></li>
                  <li key={'Power5'} className='dropdown-item'>
                    <button onClick={selectConference} className='dropdown-item' data-conf-name="Power 5">
                      Power 5
                    </button>
                  </li>
                  <li key={'Power4'} className='dropdown-item'>
                    <button onClick={selectConference} className='dropdown-item' data-conf-name="Power 4">
                      Power 4
                    </button>
                  </li>
                  <li key={'Group5'} className='dropdown-item'>
                    <button onClick={selectConference} className='dropdown-item' data-conf-name="Group of 5">
                      Group of 5
                    </button>
                  </li>
                  <li key={'Big2'} className='dropdown-item'>
                    <button onClick={selectConference} className='dropdown-item' data-conf-name="Big 2">
                      Big 2
                    </button>
                  </li>
                  <li key={'Basketball'} className='dropdown-item'>
                    <button onClick={selectConference} className='dropdown-item' data-conf-name="Basketball Conferences">
                      Basketball Conferences
                    </button>
                  </li>
                  <li key={'NCAA'} className='dropdown-item'>
                    <button onClick={selectConference} className='dropdown-item' data-conf-name="NCAA">
                      NCAA
                    </button>
                  </li>
                  <li><div className="dropdown-divider"></div></li>
                  <li><h6 className="dropdown-header">Animations</h6></li>
                  <li key={'AllCFB'} className='dropdown-item'>
                    <button onClick={preprogrammedAnimations} className='dropdown-item' data-anim-name="All of CFB History">
                      All of CFB History
                    </button>
                  </li>
                  <li key={'ModernExpansion'} className='dropdown-item'>
                    <button onClick={preprogrammedAnimations} className='dropdown-item' data-anim-name="Modern Expansion">
                      Modern Expansion
                    </button>
                  </li>
                  <li key={'DeathPac12'} className='dropdown-item'>
                    <button onClick={preprogrammedAnimations} className='dropdown-item' data-anim-name="Death of the Pac 12">
                      Death of the Pac 12
                    </button>
                  </li>
                  <li key={'CUSA'} className='dropdown-item'>
                    <button onClick={preprogrammedAnimations} className='dropdown-item' data-anim-name="CUSA & The Sun Belt: A Wild Ride">
                      CUSA & The Sun Belt: A Wild Ride
                    </button>
                  </li>
                  <li key={'Big2Since32'} className='dropdown-item'>
                    <button onClick={preprogrammedAnimations} className='dropdown-item' data-anim-name="Big 2 since 32">
                      Big 2 since '32
                    </button>
                  </li>
                  <li key={'MAC'} className='dropdown-item'>
                    <button onClick={preprogrammedAnimations} className='dropdown-item' data-anim-name="Truly Mid-American">
                      Truly Mid-American
                    </button>
                  </li>
                  <li key={'Big12'} className='dropdown-item'>
                    <button onClick={preprogrammedAnimations} className='dropdown-item' data-anim-name="What is the Big 12?">
                      What is the Big 12?
                    </button>
                  </li>
                </ul>
              </li>
              <li className="nav-item dropdown">
                <a className="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button"
                  data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                  Custom Conferences
                </a>
                <ul className="dropdown-menu" aria-labelledby="navbarDropdown">
                  <button type='button' data-toggle="modal" data-target="#customConfPopup" className='nav-link custom-conf-button'>
                    Build Custom Conference
                  </button>
                  <h6 className="dropdown-header">Your Conferences</h6>
                  {customConferences.length === 0 ? <h6 className='dropdown-header' style={{ fontStyle: 'italic', }}>None</h6> : null}
                  {customConferences.map((conf) => (
                    <li key={conf.name} className='dropdown-item'>
                      <button onClick={(e) => { e.stopPropagation(); selectCustomConference(e) }}
                        className='dropdown-item'
                        data-conf-name={conf.conference}>
                        {conf.conference}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>

            </ul>
          </div>


          <form className="w-auto" onChange={searchYears} onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
            }
          }}>
            <input type="search" className="form-control searchbar" placeholder="Type a Year" aria-label="Search" maxLength="4" />
          </form>
        </div >
      </nav >
    </>
  )
}

const DraggableTimeline = ({ years, setYear, selectedYear, redraw, setRedraw, setAnimate }) => {

  let yearRange = Math.abs(years[0] - years[years.length - 1]);

  const nodeRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0, percentPosition: 0 });
  const lineDotRef = useRef(null);
  const [prevYear, setPrevYear] = useState(selectedYear);
  const [draggableKey, setDraggableKey] = useState(0);
  const [bounds, setBounds] = useState({ left: -100, right: 100, top: 0, bottom: 0 });
  const yearWidth = 50;


  const updateBounds = () => {
    if (!lineDotRef.current) return console.log('No ref');
    let totalYearsWidth = yearWidth * yearRange;
    let leftBound = -(totalYearsWidth + yearWidth);
    setBounds({ left: leftBound, right: 1, top: 0, bottom: 0 });
  };

  useEffect(() => {
    updateBounds();
    const newX = -(selectedYear - years[0]) * yearWidth - yearWidth / 2;
    setPosition({ x: newX, y: 0, percentPosition: newX / bounds.left });
    setPrevYear(selectedYear);
  }, [yearRange]);

  useEffect(() => {
    if (redraw) {
      setDraggableKey(draggableKey + 1);
      setPrevYear(selectedYear);
      setYear(selectedYear);
      setPosition({ x: -(selectedYear - years[0]) * yearWidth - yearWidth / 2, y: 0, percentPosition: -(selectedYear - years[0]) / yearRange });
      setRedraw(false);
    }
  }, [redraw]);

  useEffect(() => {

    updateBounds();

    const resizeObserver = new ResizeObserver(() => {
      updateBounds();
    });

    if (lineDotRef.current) {
      resizeObserver.observe(lineDotRef.current);
    }

    return () => {
      if (lineDotRef.current) {
        resizeObserver.unobserve(lineDotRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [lineDotRef.current, redraw]);

  const handleDrag = (e, data) => {
    setAnimate(false);
    const newPostion = { x: data.x, y: 0, percentPosition: data.x / bounds.left }
    setPosition(newPostion);
    const index = Math.floor((data.x / bounds.left) * (years.length));
    const safeIndex = index < 0 ? 0 : index >= years.length ? years.length - 1 : index;
    setYear(years[safeIndex]);
  };

  return (
    <>
      <div className='line-dot'
        ref={lineDotRef}
        style={{
          width: "100%",
          height: '30px',
          overflow: 'hidden',
          position: 'relative',
        }}>
        <Draggable axis="x" bounds={bounds} onDrag={handleDrag} position={position} nodeRef={nodeRef} key={draggableKey}>
          <div style={{ display: 'inline-block', overflow: 'hidden', whiteSpace: "nowrap", position: "absolute", left: "50%" }} ref={nodeRef}>
            {
              years.map((year, index) => (
                <div
                  key={year}
                  style={{
                    width: `${yearWidth}px`,
                    height: '30px',
                    background: selectedYear == year ? '#00254c' : 'white',
                    color: selectedYear == year ? 'white' : '#00254c',
                    border: '1px solid #ccc',
                  }}
                  className='timeline-year'
                >
                  {year}
                </div>
              ))}
          </div>
        </Draggable >
      </div >
      <div className="yearSelectorTriangle">
        <div className="triangle">
        </div>
      </div>
    </>
  );
};

function Map({ filteredConferenceList, conferenceIcons, schoolIcons, selectedConferences, mapElements, confColors, countryOpacity, confCountrySize, customConferences }) {

  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const [width, setwidth] = useState(window.innerWidth);
  const [schoolCoordinates, setSchoolCoordinates] = useState({});
  const [confCountryCoords, setConfCountryCoords] = useState({});
  const [schoolToCenterLines, setSchoolToCenterLines] = useState({})

  const CircleRadius = confCountrySize * 1609

  useEffect(() => {
    let newCoordObject = {};
    let conferenceCountryCoords = {};
    let newLineObject = {};

    filteredConferenceList.map((conference) => {
      let coords = [];
      let linesToCenter = [];
      conference.schools.map((school) => {
        coords.push([Number(school.latitude), Number(school.longitude)]);
        let lineToCenter = []
        lineToCenter.push([Number(school.latitude), Number(school.longitude)]);
        lineToCenter.push([Number(conference.capital.latitude), Number(conference.capital.longitude)]);
        linesToCenter.push(lineToCenter)
      });
      conferenceCountryCoords[conference.conference] = calculateConvexHull(coords);
      newCoordObject[conference.conference] = coords;
      newLineObject[conference.conference] = linesToCenter;
    });

    customConferences.map((conference) => {

      const confCapitalCoords = [Number(conference.capital.latitude), Number(conference.capital.longitude)];
      let coords = [];
      let linesToCenter = [];
      conference.schools.map((school) => {
        coords.push([Number(school.latitude), Number(school.longitude)]);
        let lineToCenter = []
        lineToCenter.push([Number(school.latitude), Number(school.longitude)]);
        lineToCenter.push([Number(conference.centerLat), Number(conference.centerLon)]);
        linesToCenter.push(lineToCenter)
      });
      conferenceCountryCoords[conference.conference] = calculateConvexHull(coords);
      newCoordObject[conference.conference] = coords;
      newLineObject[conference.conference] = linesToCenter;
    });

    setConfCountryCoords(conferenceCountryCoords);
    setSchoolCoordinates(newCoordObject);
    setSchoolToCenterLines(newLineObject);
  }, [filteredConferenceList, customConferences]);

  const calculateHeight = () => {
    if (width < 480) return 33;
    if (width < 1500) return 50;
    return 75;
  };

  const [mapHeight, setMapHeight] = useState(calculateHeight());


  const handleResize = () => {
    if (mapRef.current) {
      setwidth(window.innerWidth);
      const { current: map } = mapRef;
      map.fitBounds(USbounds);
      map.zoomControl.setPosition('topright');
    }
  };

  useEffect(() => {
    setMapHeight(calculateHeight());
  }, [width]);

  useEffect(() => {
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    handleResize();

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, []);

  const USbounds = [
    [49.3457868, -66.93457],
    [24.396308, -125.0859375]
  ];

  const greaterUsBounds = [
    [51, -64],
    [22, -127]
  ];

  const mapStyles = {};
  Object.keys(confColors).forEach((conference) => {
    if (conference !== 'NCAA') {
      try {
        mapStyles[conference] = {
          lineOptions: { color: confColors[conference].main, weight: "1", fill: true },
          circleOptions: { color: confColors[conference].light },
          countryOptions: { color: confColors[conference].light, weight: "1", fill: true },
        };
      } catch (error) {
        console.log(error);
      }
    }
    customConferences.map((conference) => {
      mapStyles[conference.conference] = {
        lineOptions: { color: conference.colors.light, weight: "1", fill: true },
        circleOptions: { color: conference.colors.light },
        countryOptions: { color: conference.colors.main, weight: "1", fill: true },
      };
    });
  });

  const standardLineOptions = { color: '#00254c', weight: "1", fill: true, };
  const standardCircleOptions = { color: '#00254c', fillOpacity: 0.1 };

  const genericIcon = L.icon({
    iconUrl: AWSBUCKET + 'static/dist/images/FBicon.png',
    iconSize: [20, 20],
    iconAnchor: [10, 0],
  });

  return (
    <div ref={containerRef}>
      <MapContainer
        key={mapHeight}
        maxBounds={USbounds}
        maxBoundsViscosity={1.0}
        ref={mapRef}
        style={{ height: `${mapHeight}vh`, width: '100%' }}
        zoomSnap={.25}
        zoomDelta={.5}
        minZoom={2}
        maxZoom={5}
        whenCreated={(mapInstance) => { mapRef.current = mapInstance; handleResize(); }}
      >
        <TileLayer
          attribution='&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url='https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png'
        />
        {filteredConferenceList.map((conference) => conference.schools.map((school) => (
          <Fragment key={`${school.name}-${school.id}`}>
            {mapElements.teams ?
              <Marker position={[Number(school.latitude), Number(school.longitude)]}
                icon={schoolIcons[school.name] || myIcon} zIndexOffset={1000} key={`${school.name}-${school.id}-marker`}>
                <Popup>
                  {school.name} - {school.city}, {school.state}
                </Popup>
              </Marker>
              : null
            }
            {mapElements.schoolCircles ?
              <Circle
                center={[Number(school.latitude), Number(school.longitude)]}
                pathOptions={{ ...mapStyles[conference.conference].circleOptions, fillOpacity: countryOpacity } || standardCircleOptions}
                radius={CircleRadius}
                stroke={false}
                key={`${school.name}-${school.id}-circle`}
              />
              : null
            }
          </Fragment>
        ))
        )
        }
        {customConferences.map((conference) => conference.schools.map((school) => (
          <Fragment key={`${school.name}-${school.id}-custom`}>
            {mapElements.teams ?
              <Marker position={[Number(school.latitude), Number(school.longitude)]}
                icon={schoolIcons[school.name] || myIcon} zIndexOffset={1000} key={`${school.name}-${school.id}-custom-marker`}>
                <Popup>
                  {school.name} - {school.city}, {school.state}
                </Popup>
              </Marker>
              : null
            }
            {mapElements.schoolCircles ?
              <Circle
                center={[Number(school.latitude), Number(school.longitude)]}
                pathOptions={{ ...mapStyles[conference.conference].circleOptions, fillOpacity: countryOpacity } || standardCircleOptions}
                radius={CircleRadius}
                stroke={false}
                key={`${school.name}-${school.id}-custom-circle`}
              />
              : null
            }
          </Fragment>
        ))
        )
        }
        {mapElements.capitals && filteredConferenceList.map((conference) => (
          <Marker key={`${conference.capital.name}-${conference.id}`}
            position={[Number(conference.capital.latitude), Number(conference.capital.longitude)]}
            icon={conferenceIcons[conference.conference]} zIndexOffset={500}>
            <Popup>
              Proposed {conference.conference} Capital: {conference.capital.name} - {conference.capital.state}
            </Popup>
          </Marker>
        ))}
        {mapElements.capitals && customConferences.map((conference) => (
          <Marker key={`${conference.capital.name}-${conference.id}-custom`}
            position={[Number(conference.capital.latitude), Number(conference.capital.longitude)]}
            zIndexOffset={500} icon={genericIcon}>
            <Popup>
              Proposed {conference.conference} Capital: {conference.capital.city} - {conference.capital.state}
            </Popup>
          </Marker>
        ))}
        {filteredConferenceList.map((conference) => (conference.schools.map((school) => (
          school.name.includes('Hawai') ?
            <HawaiiMapOverlay key={"Hawaii-map"} school={school} schoolIcons={schoolIcons} conference={conference} lineOptions={mapStyles[conference.conference].lineOptions} circleOptions={mapStyles[conference.conference].circleOptions} mapElements={mapElements} />
            : null)
        )))}

        {mapElements.lines && selectedConferences.map((conference) => (
          schoolToCenterLines[conference] && <Polyline key={conference + "polylines"} pathOptions={mapStyles[conference].lineOptions || standardLineOptions} positions={schoolToCenterLines[conference]} />))}
        {mapElements.lines && customConferences.map((conference) => (
          schoolToCenterLines[conference.conference] && <Polyline key={conference.conference + "polylines"} pathOptions={mapStyles[conference.conference].lineOptions || standardLineOptions} positions={schoolToCenterLines[conference.conference]} />))}

        {mapElements.confCountry && selectedConferences.map((conference) => (
          confCountryCoords[conference] && <Polygon key={conference + "confCountry"} pathOptions={{ ...mapStyles[conference].countryOptions, fillOpacity: countryOpacity || standardLineOptions }} positions={confCountryCoords[conference]} />))}
        {mapElements.confCountry && customConferences.map((conference) => (
          confCountryCoords[conference.conference] && <Polygon key={conference.conference + "confCountry"} pathOptions={{ ...mapStyles[conference.conference].countryOptions, fillOpacity: countryOpacity || standardLineOptions }} positions={confCountryCoords[conference.conference]} />))}
      </MapContainer>
    </div>
  )
};

const HawaiiMapOverlay = ({ school, schoolIcons, conference, lineOptions, circleOptions, mapElements }) => {
  const hawaiiCenter = [20.7984, -157];

  const lineToCenter = [hawaiiCenter, [Number(conference.capital.latitude), Number(conference.capital.longitude)]]

  const calculateHeight = () => {
    if (vpWidth < 768) return 10;
    if (vpWidth < 1500) return 12;
    return 37;
  };

  const calculateWidth = () => {
    if (vpWidth < 768) return 10;
    if (vpWidth < 1500) return 12;
    return 37;
  }

  const calculateZoomLevel = () => {
    if (vpWidth < 768) return 4;
    if (vpWidth < 1500) return 4;
    return 6;
  };

  let overlayBoolean = mapElements.teams || mapElements.lines || mapElements.confCountry;

  return (
    <>
      {overlayBoolean &&
        <MapContainer
          className='hawaii-map-overlay'
          center={hawaiiCenter}
          zoom={calculateZoomLevel()}
          style={{ height: `${calculateHeight()}vh`, width: `${calculateWidth()}vw`, position: 'absolute', bottom: '10px', left: '10px', zIndex: 1000 }}
          scrollWheelZoom={false}
          dragging={false}
          zoomControl={false}
          doubleClickZoom={false}
        >
          <TileLayer
            url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' id='HawaiiAttribution'
          />
          {mapElements.teams && <Marker key={school.id} position={[Number(school.latitude), Number(school.longitude)]} icon={schoolIcons[school.name]} />}
          {mapElements.confCountry && <Circle center={[Number(school.latitude), Number(school.longitude)]} pathOptions={circleOptions} radius={200 * 1609} stroke={false} />}
          {mapElements.lines && <Polyline pathOptions={lineOptions} positions={lineToCenter} />}
        </MapContainer>}
    </>
  );
};

function ConferenceDetails({ conference, confLogos, confColors, selectedConference, selectedYear, startYear, endYear, setYear, numberOfConf, avgDistanceBetweenBoolean, avgDistanceFromCenterBoolean }) {

  return (conference ?
    conference.custom ?
      <div className='conference-details'>
        <div className='conference-details-main'>
          <h3 className='conference-details-conference' style={{ border: "none" }}>
            <span className='conference-details-category-header'>Conference: </span>
            <span>{conference.conference} (custom)</span>
          </h3>
        </div>
        <div className='conference-details-specific'>
          <table className='conference-details-table'>
            <tbody>
              <tr>
                <td className='conference-details-category'>Proposed Capital</td>
                <td className='conference-details-item'>{conference.capital.city}, {conference.capital.state}</td>
              </tr>
              <tr>
                <td className='conference-details-category'>Number of Schools</td>
                <td className='conference-details-item'>{conference.schools.length}</td>
              </tr>
              {avgDistanceBetweenBoolean ?
                <tr>
                  <td className='conference-details-category'>
                    Avg. Distance Between Schools
                  </td>
                  <td className='conference-details-item'>{Math.round(conference.avgDistanceBetweenSchools)} miles</td>
                </tr>
                : null}
              {avgDistanceFromCenterBoolean ?
                <tr>
                  <td className='conference-details-category'>
                    Avg. Distance from GeoCenter
                  </td>
                  <td className='conference-details-item'>{Math.round(conference.avgDistanceFromCenter)} miles</td>
                </tr>
                : null}
            </tbody>
          </table>
        </div>
      </div>
      :
      <div className='conference-details'>
        <div className='conference-details-main'>
          <h3 className='conference-details-conference'>
            <span className='conference-details-category-header'>{conference.conference == "NCAA" ? "Summary Stats:" : "Conference:"}</span>
            <img className='conference-details-conference-img' src={confLogos[conference.conference]} />
          </h3>
          <h3 className='conference-details-year'>
            <span className='conference-details-category-header'>
              Year:
            </span>
            <span className='conference-details-category-header-year'>
              {conference.year}
            </span>
          </h3>
        </div>
        <div className='conference-details-specific'>
          <table className='conference-details-table'>
            <tbody>
              {conference.conference !== "NCAA" ?
                <tr>
                  <td className='conference-details-category'>Proposed Capital</td>
                  <td className='conference-details-item'>{conference.capital.name}, {conference.capital.state}</td>
                </tr>
                :
                <tr>
                  <td className='conference-details-category'>Number of Conferences</td>
                  <td className='conference-details-item'>{numberOfConf}</td>
                </tr>}
              <tr>
                <td className='conference-details-category'>Number of Schools</td>
                <td className='conference-details-item'>{conference.schools.length}</td>
              </tr>
              {avgDistanceBetweenBoolean ?
                <tr>
                  <td className='conference-details-category'>
                    <span className="conference-details-color-square" style={{ backgroundColor: confColors[selectedConference].main }}></span>
                    Avg. Distance Between Schools
                  </td>
                  <td className='conference-details-item'>{Math.round(conference.avgDistanceBetweenSchools)} miles</td>
                </tr>
                : null}
              {avgDistanceFromCenterBoolean ?
                <tr>
                  <td className='conference-details-category'>
                    <span className="conference-details-color-square" style={{ backgroundColor: confColors[selectedConference].light }}></span>
                    Avg. Distance from GeoCenter
                  </td>
                  <td className='conference-details-item'>{Math.round(conference.avgDistanceFromCenter)} miles</td>
                </tr>
                : null}
            </tbody>
          </table>
        </div>
      </div>
    :
    <div className='conference-details'>
      <div className='conference-details-main'>
        <h3 className='conference-details-conference'>
          <span className='conference-details-category-header'>Conference:</span>
          <img className='conference-details-conference-img' src={confLogos[selectedConference]} />
        </h3>
        <h3 className='conference-details-year'>
          <span className='conference-details-category-header'>
            Year:
          </span>
          <span className='conference-details-category-header-year'>
            {selectedYear}
          </span>
        </h3>
      </div>
      <div className='chart-container'>
        {selectedYear < startYear ?
          <>
            <button className='out-of-range-button' onClick={() => setYear(startYear)}>
              <p>Conference does not exist yet.</p>
              <p>Jump to {startYear}</p>
            </button>
          </>
          :
          <>
            <button className='out-of-range-button' onClick={() => setYear(endYear)}>
              <p>Conference does not exist yet.</p>
              <p>Jump to {endYear}</p>
            </button>
          </>
        }
      </div>
    </div>
  )
};

function AboutPopup() {
  return (
    <div className='modal fade' id='aboutPopup' tabIndex="-1" role="dialog" aria-labelledby="aboutPopupLabel" aria-hidden="true">
      <div className="modal-dialog" role="document">
        <div className="modal-content about-container">
          <div className="modal-header">
            <div className='close-button-container'>
              <button type='button' className='close-button' data-dismiss="modal" aria-label="Close">X</button>
            </div>
            <h2 className='modal-title'>About CFB Realignment Tool</h2>
          </div>
          <div className="modal-body">

            <section>
              <h2 className='about-header'>Understanding the Changing Landscape of College Football</h2>
              <p>
                In recent years, NCAA conference realignment has become one of the most significant topics in college football. Universities across the country have shifted alliances, driven by factors such as media rights deals, geographic considerations, and the pursuit of competitive advantages. These realignments have reshaped the conferences we’ve known for decades, creating a dynamic and ever-evolving landscape.
              </p>
            </section>

            <section>
              <h2 className='about-header'>Our Mission</h2>
              <p>
                CFB Realignment is designed to provide a comprehensive analysis and visualization of these changes. Whether you're a dedicated fan or a curious observer, our goal is to offer insights into how conferences are evolving, both geographically and competitively.
              </p>
            </section>

            <section>
              <h2 className='about-header'>Key Features of the Site</h2>
              <ul>
                <li>
                  <strong>Interactive Mapping:</strong> Our site features a powerful interactive map that allows users to visualize the geographic distribution of NCAA conferences. With just a few clicks, you can see how conference boundaries have shifted over time, explore the locations of member institutions, and gain a clearer understanding of regional dynamics.
                </li>
                <li>
                  <strong>Charting Realignments:</strong> Dive deeper into the data with our charting tools. We provide visualizations that highlight trends in conference realignment, including the movement of teams between conferences, the growth or contraction of conferences, and the implications of these changes on the college football landscape.
                </li>
                <li>
                  <strong>Custom Conferences:</strong> Want to explore what a different alignment might look like? Our custom conference tool lets you create your own conference alignments, mixing and matching teams to see how your ideal conference would stack up. This feature is perfect for fans who enjoy theorizing about the "what-ifs" of college football.
                </li>
              </ul>
            </section>

          </div>

          <div className="modal-footer">

            <section className='about-for-devs'>
              <h2 className='about-header'>For Developers</h2>
              <p>
                If you're interested in exploring the data behind the site, we offer a comprehensive API that provides access to all the information you see here. Our API is designed to be easy to use and well-documented, making it simple to integrate our data into your own projects. Whether you're a seasoned developer or just getting started, we invite you to explore the possibilities of our API and see what you can create.
              </p>
              <h4>API Documentation</h4>
              <ul>
                <li>
                  <a href="https://api.cfbrealignment.com/swagger/" target="_blank" rel="noopener noreferrer">Swagger</a>
                </li>
                <li>
                  <a href="https://api.cfbrealignment.com/redoc/" target="_blank" rel="noopener noreferrer">Redoc</a>
                </li>
              </ul>
              <h4>GitHub Repositories</h4>
              <ul>
                <li>
                  <a href="https://github.com/EvanJelley/CFB-Realignment-API" target="_blank" rel="noopener noreferrer">API</a>
                </li>
                <li>
                  <a href="https://github.com/EvanJelley/CFB-Realignment-Site" target="_blank" rel="noopener noreferrer">Front-end</a>
                </li>
              </ul>
            </section>



            {/* <section>
              <h2>Join the Conversation</h2>
              <p>
                CFB Realignment is more than just a data tool—it's a platform for fans to engage with one of the most exciting aspects of college football today. We invite you to explore the site, share your insights, and join the ongoing conversation about the future of college football.
              </p>
            </section> */}
          </div>

        </div>
      </div>
    </div>
  )
}


export default App