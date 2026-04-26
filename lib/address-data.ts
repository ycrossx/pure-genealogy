export interface AddressOption {
  value: string;
  label: string;
  code?: string;
}

interface AddressTree {
  [country: string]: {
    [province: string]: {
      [city: string]: {
        [district: string]: string[];
      };
    };
  };
}

export const ADDRESS_TREE: AddressTree = {
  中国: {
    江苏省: {
      苏州市: {
        吴中区: ["木渎镇", "甪直镇", "胥口镇", "光福镇", "临湖镇"],
        姑苏区: ["平江街道", "沧浪街道", "金阊街道"],
        昆山市: ["玉山镇", "周市镇", "陆家镇", "花桥镇"],
      },
      南京市: {
        玄武区: ["梅园新村街道", "新街口街道", "玄武门街道"],
        秦淮区: ["夫子庙街道", "双塘街道", "中华门街道"],
        江宁区: ["东山街道", "秣陵街道", "汤山街道"],
      },
      无锡市: {
        梁溪区: ["崇安寺街道", "清名桥街道"],
        锡山区: ["东亭街道", "安镇街道"],
      },
    },
    湖南省: {
      长沙市: {
        芙蓉区: ["定王台街道", "马王堆街道"],
        岳麓区: ["岳麓街道", "望岳街道", "梅溪湖街道"],
        长沙县: ["星沙街道", "黄花镇", "榔梨街道"],
      },
      岳阳市: {
        岳阳楼区: ["岳阳楼街道", "金鹗山街道"],
        平江县: ["汉昌街道", "三阳乡", "安定镇"],
      },
      衡阳市: {
        石鼓区: ["人民街道", "潇湘街道"],
        衡阳县: ["西渡镇", "台源镇", "井头镇"],
      },
    },
    广东省: {
      广州市: {
        越秀区: ["北京街道", "东山街道"],
        天河区: ["天河南街道", "五山街道", "猎德街道"],
        番禺区: ["市桥街道", "大石街道", "南村镇"],
      },
      深圳市: {
        福田区: ["园岭街道", "华强北街道", "香蜜湖街道"],
        南山区: ["南头街道", "粤海街道", "蛇口街道"],
        宝安区: ["新安街道", "西乡街道", "福永街道"],
      },
      梅州市: {
        梅江区: ["金山街道", "江南街道"],
        梅县区: ["程江镇", "畲江镇", "松口镇"],
      },
    },
    浙江省: {
      杭州市: {
        西湖区: ["西湖街道", "转塘街道"],
        上城区: ["湖滨街道", "清波街道"],
        萧山区: ["城厢街道", "瓜沥镇"],
      },
      宁波市: {
        海曙区: ["鼓楼街道", "月湖街道"],
        鄞州区: ["首南街道", "中河街道"],
      },
    },
    四川省: {
      成都市: {
        锦江区: ["春熙路街道", "沙河街道"],
        武侯区: ["浆洗街街道", "玉林街道"],
        双流区: ["东升街道", "黄龙溪镇"],
      },
    },
    重庆市: {
      重庆市: {
        渝中区: ["解放碑街道", "朝天门街道"],
        江北区: ["观音桥街道", "寸滩街道"],
        沙坪坝区: ["沙坪坝街道", "磁器口街道"],
      },
    },
  },
  美国: {
    加利福尼亚州: {
      洛杉矶: {
        洛杉矶县: ["洛杉矶市"],
      },
      旧金山: {
        旧金山县: ["旧金山市"],
      },
    },
    纽约州: {
      纽约市: {
        纽约县: ["曼哈顿"],
        皇后县: ["皇后区"],
      },
    },
  },
};

function makeCode(parts: string[]): string {
  if (parts.length === 1 && parts[0] === "中国") return "CN";
  return parts.join("|");
}

function toOptions(values: string[], parentParts: string[] = []): AddressOption[] {
  return values.map((value) => {
    const code = makeCode([...parentParts, value]);
    return { value: code, label: value, code };
  });
}

export function getCountries(): AddressOption[] {
  return toOptions(Object.keys(ADDRESS_TREE));
}

export function getProvinces(country: string): AddressOption[] {
  return toOptions(Object.keys(ADDRESS_TREE[country] || {}), [country]);
}

export function getCities(country: string, province: string): AddressOption[] {
  return toOptions(Object.keys(ADDRESS_TREE[country]?.[province] || {}), [country, province]);
}

export function getDistricts(country: string, province: string, city: string): AddressOption[] {
  return toOptions(Object.keys(ADDRESS_TREE[country]?.[province]?.[city] || {}), [country, province, city]);
}

export function getTowns(country: string, province: string, city: string, district: string): AddressOption[] {
  return toOptions(ADDRESS_TREE[country]?.[province]?.[city]?.[district] || [], [country, province, city, district]);
}
