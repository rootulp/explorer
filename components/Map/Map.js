import { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react'
import { useMediaQuery } from 'react-responsive'
import ReactMapboxGl from 'react-mapbox-gl'
import { h3ToGeo } from 'h3-js'
import { useAsync } from 'react-async-hook'
import useSWR from 'swr'
import { findBounds } from '../../utils/location'
import CoverageLayer from './Layers/CoverageLayer'
import HotspotDetailLayer from './Layers/HotspotDetailLayer'
import useSelectedHotspot from '../../hooks/useSelectedHotspot'
import useMapLayer from '../../hooks/useMapLayer'
import useInfoBox from '../../hooks/useInfoBox'
import useGeolocation from '../../hooks/useGeolocation'
import ValidatorsLayer from './Layers/ValidatorsLayer'
import useSelectedTxn from '../../hooks/useSelectedTxn'
import { fetchHotspot } from '../../data/hotspots'

const maxZoom = 14
const minZoom = 2

const Mapbox = ReactMapboxGl({
  accessToken: process.env.NEXT_PUBLIC_MAPBOX_KEY,
  interactive: true,
  touchZoomRotate: true,
  maxZoom: maxZoom,
  minZoom: minZoom,
})

const US_BOUNDS = [
  [-61.08, 44.84],
  [-125, 33],
]

const US_EU_BOUNDS = [
  [32.1, 58.63],
  [-125, 33],
]

const EU_CN_BOUNDS = [
  [143.61, 62.2],
  [-14.10009, 23.898041],
]

const MOBILE_PADDING = { top: 10, left: 10, right: 10, bottom: 450 }
const DESKTOP_PADDING = { top: 200, left: 600, right: 200, bottom: 200 }

const CoverageMap = ({ coverageUrl }) => {
  const isDesktopOrLaptop = useMediaQuery({ minDeviceWidth: 1224 })
  const map = useRef()
  const [styleLoaded, setStyledLoaded] = useState(false)
  const [selectedTxnHotspot, setSelectedTxnHotspot] = useState()
  const [selectedTxnWitnesses, setSelectedTxnWitnesses] = useState([])

  const { showInfoBox } = useInfoBox()
  const { mapLayer } = useMapLayer()
  const { selectHotspot, selectedHotspot } = useSelectedHotspot()
  const { selectedTxn } = useSelectedTxn()
  const { currentPosition } = useGeolocation()

  const [bounds, setBounds] = useState(
    isDesktopOrLaptop ? US_EU_BOUNDS : US_BOUNDS,
  )

  const { data: validators } = useSWR('/api/validators')

  useEffect(() => {
    if (!currentPosition.coords) return
    setBounds(
      findBounds([
        {
          lng: currentPosition.coords.longitude,
          lat: currentPosition.coords.latitude,
        },
      ]),
    )
  }, [currentPosition.coords, currentPosition.timestamp])

  useEffect(() => {
    if (!selectedHotspot) return

    const selectionBounds = findBounds([
      ...(selectedHotspot.witnesses || []).map(({ lat, lng }) => ({
        lat,
        lng,
      })),
      { lat: selectedHotspot.lat, lng: selectedHotspot.lng },
    ])
    setBounds(selectionBounds)
  }, [selectedHotspot])

  useEffect(() => {
    if (!selectedTxnHotspot || !selectedTxnWitnesses) return

    const selectionBounds = findBounds([
      ...(selectedTxnWitnesses || []).map(({ lat, lng }) => ({
        lat,
        lng,
      })),
      { lat: selectedTxnHotspot.lat, lng: selectedTxnHotspot.lng },
    ])
    setBounds(selectionBounds)
  }, [selectedTxnHotspot, selectedTxnWitnesses])

  useAsync(async () => {
    if (selectedTxn?.type === 'poc_receipts_v1') {
      const target = selectedTxn.path[0].challengee
      const targetHotspot = await fetchHotspot(target)
      const witnesses = selectedTxn.path[0].witnesses.map((w) => {
        const [lat, lng] = h3ToGeo(w.location)
        return { ...w, lat, lng }
      })

      setSelectedTxnHotspot(targetHotspot)
      setSelectedTxnWitnesses(witnesses)
    } else {
      setSelectedTxnHotspot(undefined)
      setSelectedTxnWitnesses([])
    }
  }, [selectedTxn])

  const fitBoundsOptions = useMemo(() => {
    const animate = styleLoaded
    if (isDesktopOrLaptop) return { padding: DESKTOP_PADDING, animate }
    if (showInfoBox) return { padding: MOBILE_PADDING, animate }
    return { padding: 10, animate }
  }, [isDesktopOrLaptop, showInfoBox, styleLoaded])

  // useEffect(() => {
  //   setTimeout(() => {
  //     setBounds(EU_CN_BOUNDS)
  //   }, 5000)
  // }, [])

  const handleHotspotClick = useCallback(
    (e) => {
      const features = map.current.queryRenderedFeatures(e.point, {
        layers: ['hotspots-circle'],
      })

      if (features.length === 1) {
        // if a single hotspot was clicked on, then select it
        const [feature] = features
        const selectedHotspot = {
          lat: feature.geometry.coordinates[1],
          lng: feature.geometry.coordinates[0],
          ...feature.properties,
        }
        selectHotspot(selectedHotspot.address)
      } else {
        // if more than one hotspot was clicked on, adjust bounds to fit that cluster
        const selectionBounds = findBounds(
          features.map(({ geometry: { coordinates } }) => ({
            lat: coordinates[1],
            lng: coordinates[0],
          })),
        )
        setBounds(selectionBounds)
      }

      map.current.getCanvas().style.cursor = ''
    },
    [selectHotspot],
  )

  const handleMouseMove = useCallback((map, e) => {
    const features = map.queryRenderedFeatures(e.point, {
      layers: ['hotspots-circle'],
    })
    if (features.length > 0) {
      map.getCanvas().style.cursor = 'pointer'
    } else {
      map.getCanvas().style.cursor = ''
    }
  }, [])

  return (
    <Mapbox
      style="mapbox://styles/petermain/cko1ewc0p0st918lecxa5c8go"
      className="h-full w-screen overflow-hidden"
      fitBounds={bounds}
      fitBoundsOptions={fitBoundsOptions}
      onStyleLoad={(mapInstance) => {
        map.current = mapInstance
        setStyledLoaded(true)
      }}
      onMouseMove={handleMouseMove}
    >
      <CoverageLayer
        coverageUrl={coverageUrl}
        minZoom={minZoom}
        maxZoom={maxZoom}
        onHotspotClick={handleHotspotClick}
        layer={mapLayer}
      />
      <HotspotDetailLayer
        hotspot={selectedHotspot || selectedTxnHotspot}
        witnesses={selectedHotspot?.witnesses || selectedTxnWitnesses || []}
      />
      <ValidatorsLayer
        validators={validators}
        minZoom={minZoom}
        maxZoom={maxZoom}
      />
    </Mapbox>
  )
}

export default memo(CoverageMap)