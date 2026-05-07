import { View, Text, Navigator } from '@tarojs/components'
import { useLoad } from '@tarojs/taro'
import './index.scss'

export default function Index() {

  useLoad(() => {
    console.log('Page loaded.')
  })

  return (
    <View className='index'>
      <View className='header'>
        <Text className='title'>黑洞引擎 3D WebXR</Text>
        <Text className='subtitle'>移动端 BIM 模型查看器</Text>
      </View>
      
      <View className='features'>
        <Text className='feature-title'>核心功能</Text>
        <Text className='feature-item'>• 3D BIM 模型渲染</Text>
        <Text className='feature-item'>• 单指旋转视角</Text>
        <Text className='feature-item'>• 双指缩放模型</Text>
        <Text className='feature-item'>• 双指平移视角</Text>
        <Text className='feature-item'>• 构件探测选中</Text>
      </View>
      
      <Navigator url='/pages/viewer/index' className='btn-primary'>
        进入 3D 查看器
      </Navigator>
      
      <View className='tech-info'>
        <Text className='tech-title'>技术栈</Text>
        <Text className='tech-item'>Taro 3.6 + React 18</Text>
        <Text className='tech-item'>BlackHole Engine SDK v3.2</Text>
        <Text className='tech-item'>Webpack 5 + TypeScript</Text>
      </View>
    </View>
  )
}